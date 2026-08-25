/**
 * quote-session.ts — Operaciones AUTENTICADAS de apoyo para los specs del widget de Quote.
 *
 * El widget de cotización es ANÓNIMO (sin login, ver `QuoteWidgetPage`), pero varios ejes de la
 * matriz Stripe §2 exigen tocar estado del carrier que solo existe detrás de una sesión de
 * dispatcher:
 *   - hold ON/OFF por API (variantes "sin Hold desde Alta de Viaje"),
 *   - resolver el TELÉFONO REGISTRADO del solicitante (variantes "usuario con número de teléfono
 *     vinculado a usuario colaborador existente"),
 *   - contar los pax que matchean una búsqueda (oráculo "vinculado a usuario EXISTENTE": el alta
 *     desde Quote NO debe crear un pasajero nuevo),
 *   - cancelar por API el viaje creado (cleanup — el widget no puede).
 *
 * Mismo criterio que `quote-card-precondition.ts` (sesión nueva por operación, cerrada SIEMPRE):
 * mezclar la sesión anónima del widget con una autenticada arrastra cookies entre contextos
 * conceptualmente distintos y produce fallos intermitentes que se confunden con flakiness.
 *
 * REGLA DE NEGOCIO del vínculo (fuente BE `QuotesService.getPassenger`, ingeniería inversa):
 *   1. existencia: `findPassengerByEmailOrPhone(carrierId, email, phone)` — mail O teléfono;
 *   2. resolución: primero por MAIL (`findPassengerByEmailAndCarrier`); si no matchea,
 *      por TELÉFONO (`findPassengerByPhone(...).get(0)`);
 *   3. sin match → CREA un pasajero nuevo (`createUser`).
 * De ahí los dos ejes automatizables sin degradarse mutuamente:
 *   - vínculo por MAIL: mail registrado + teléfono sintético NO registrado;
 *   - vínculo por TELÉFONO: teléfono registrado + casilla yopmail sintética NO registrada
 *     (la resolución por mail falla y cae a la de teléfono — el eje queda aislado).
 */
import type { Browser, Page } from '@playwright/test';
import type { GatewayName } from '@fixtures/gateways/_shared';

import { expect, test } from '@TestFixture';
import { loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { getApiHeaders } from '@features/gateway-pg/helpers/card-precondition';
import { getCarrierParameters, readHoldRaw, setHoldViaApi } from '@features/gateway-pg/helpers/parameters-api';
import { cancelTravel } from '@features/gateway-pg/helpers/travel-cleanup';

const DEFAULT_CARRIER_ID = process.env.CARRIER_ID ?? '1521';

function resolveApiBase(page: Page): string {
	const baseUrl = process.env.BASE_URL ?? new URL(page.url()).origin;
	return `${baseUrl}/magiis-v0.2`;
}

/**
 * Abre una sesión de dispatcher NUEVA, ejecuta `fn` y cierra el contexto SIEMPRE.
 * Explícito en la firma (recibe `browser`) por la misma razón que `expectQuoteTripInPortal`:
 * un helper que abre sesiones no debe esconder ese efecto.
 */
export async function withDispatcherSession<T>(
	browser: Browser,
	gateway: GatewayName,
	fn: (page: Page) => Promise<T>
): Promise<T> {
	const context = await browser.newContext();
	try {
		const page = await context.newPage();
		await loginAsDispatcher(page, { gateway });
		return await fn(page);
	} finally {
		await context.close();
	}
}

/**
 * Fija el hold del carrier por API desde una sesión nueva, con READ-BACK CRUDO
 * (misma disciplina de oráculo que `CarrierHoldSteps.enableHoldViaApi/disableHoldViaApi`:
 * assert sobre un GET posterior, nunca sobre el payload que se acaba de postear).
 */
export async function setHoldFromNewSession(browser: Browser, gateway: GatewayName, enabled: boolean): Promise<void> {
	await test.step(`Hold del carrier → ${enabled ? 'ON' : 'OFF'} vía API (sesión dispatcher nueva)`, async () => {
		await withDispatcherSession(browser, gateway, async page => {
			await setHoldViaApi(page, enabled);
			if (enabled) {
				const persisted = await getCarrierParameters(page);
				expect(
					persisted.enableCreditCardHold,
					'read-back API: enableCreditCardHold debe quedar true (campo ausente = fallo)'
				).toBe(true);
			} else {
				expect(
					await readHoldRaw(page),
					'read-back API: enableCreditCardHold debe quedar false (campo ausente = fallo)'
				).toBe(false);
			}
		});
	});
}

/** Fila del buscador de pasajeros del carrier (shape observado vía `getPassengerId`). */
export interface CarrierPaxRow {
	passengerUserId?: number;
	[key: string]: unknown;
}

/**
 * GET /magiis-v0.2/passengers/carrier/{carrierId}?lastName={query} — el MISMO endpoint que ya
 * consume `card-precondition.getPassengerId`, acá devolviendo TODAS las filas (el spec de Quote
 * necesita el registro completo del pax, no solo su id).
 */
export async function searchCarrierPassengers(
	page: Page,
	lastNameQuery: string,
	carrierId = DEFAULT_CARRIER_ID
): Promise<CarrierPaxRow[]> {
	const apiBase = resolveApiBase(page);
	const url = `${apiBase}/passengers/carrier/${carrierId}?lastName=${encodeURIComponent(lastNameQuery)}`;
	const headers = await getApiHeaders(page);

	const response = await page.request.get(url, { headers });
	if (!response.ok()) {
		throw new Error(
			`[quote-session] búsqueda de pax "${lastNameQuery}" falló: ${response.status()} ${response.statusText()}`
		);
	}
	const data = await response.json().catch(() => null);
	return Array.isArray(data) ? (data as CarrierPaxRow[]) : data ? [data as CarrierPaxRow] : [];
}

/** Candidatos de nombre de campo para mail/teléfono en la fila del pax (shape no tipado en el repo). */
const EMAIL_KEYS = ['email', 'mail', 'userEmail'] as const;
const PHONE_KEYS = ['phone', 'phoneNumber', 'cellphone', 'telephone', 'userPhone'] as const;

function readFirstString(row: CarrierPaxRow, keys: readonly string[]): string | null {
	for (const key of keys) {
		const value = row[key];
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return null;
}

export type RegisteredQuoteContact = {
	phone: string | null;
	email: string | null;
	/** Keys disponibles en la fila usada — diagnóstico cuando phone/email vienen null. */
	availableKeys: string[];
};

/**
 * Resuelve el TELÉFONO/MAIL REGISTRADOS del solicitante desde el buscador de pax del carrier.
 * No inventa datos: si el registro no expone teléfono, devuelve null y el spec decide (skip con
 * motivo de precondición, no un rojo que apunte al lugar equivocado).
 *
 * FRAGILE / TODO(live): los nombres de campo del DTO no están tipados en el repo — se prueban
 * candidatos y `availableKeys` deja la evidencia para fijar el real en la primera corrida.
 *
 * @param expectedEmail si se pasa, se prefiere la fila cuyo mail matchea (distingue al colaborador
 *   'smith, Emanuel' de otros pax con el mismo apellido, ej. 'Nayla Smith').
 */
export async function resolveRegisteredQuoteContact(
	browser: Browser,
	gateway: GatewayName,
	searchQuery: string,
	expectedEmail?: string
): Promise<RegisteredQuoteContact> {
	return withDispatcherSession(browser, gateway, async page => {
		const rows = await searchCarrierPassengers(page, searchQuery);
		if (!rows.length) {
			return { phone: null, email: null, availableKeys: [] };
		}

		const byEmail = expectedEmail
			? rows.find(row => {
				const mail = readFirstString(row, EMAIL_KEYS);
				return mail?.toLowerCase() === expectedEmail.toLowerCase();
			})
			: undefined;
		const withPhone = rows.find(row => readFirstString(row, PHONE_KEYS));
		const chosen = byEmail ?? withPhone ?? rows[0];

		return {
			phone: readFirstString(chosen, PHONE_KEYS),
			email: readFirstString(chosen, EMAIL_KEYS),
			availableKeys: Object.keys(chosen)
		};
	});
}

/**
 * Filas del buscador de pax cuyo MAIL registrado coincide (case-insensitive) con `email`.
 *
 * Uso (review MEDIUM-3): precondición anti-envenenamiento del eje TELÉFONO — la casilla yopmail
 * sintética del vínculo por teléfono NO debe figurar como mail registrado de ningún pax que
 * matchee la búsqueda. Si figura, una corrida anterior degradó los datos (el BE terminó creando
 * o mutando un pax con esa casilla) y la resolución por MAIL ganaría SIEMPRE: el eje teléfono
 * quedaría permanentemente sin ejercitar y el spec verde no lo delataría jamás.
 */
export async function findCarrierPaxByEmail(
	browser: Browser,
	gateway: GatewayName,
	searchQuery: string,
	email: string
): Promise<CarrierPaxRow[]> {
	return withDispatcherSession(browser, gateway, async page => {
		const rows = await searchCarrierPassengers(page, searchQuery);
		return rows.filter(row => readFirstString(row, EMAIL_KEYS)?.toLowerCase() === email.toLowerCase());
	});
}

/**
 * Cuenta los pax del carrier que matchean la búsqueda. Es el oráculo del eje "usuario EXISTENTE"
 * de la matriz: si el alta desde Quote creó un pasajero NUEVO (el vínculo por mail/teléfono
 * falló y el BE cayó en `createUser`), el conteo post-alta crece — y el caso debe romper ahí,
 * no pasar midiendo un viaje de un pax duplicado con el mismo nombre.
 */
export async function countCarrierPassengers(
	browser: Browser,
	gateway: GatewayName,
	searchQuery: string
): Promise<number> {
	return withDispatcherSession(
		browser,
		gateway,
		async page => (await searchCarrierPassengers(page, searchQuery)).length
	);
}

/** Cancela por API un viaje creado desde el widget (el contexto anónimo no puede — sin JWT). */
export async function cancelTravelFromNewSession(
	browser: Browser,
	gateway: GatewayName,
	travelId: number
): Promise<boolean> {
	return withDispatcherSession(browser, gateway, async page => {
		// cancelTravel resuelve headers vía extractAuthToken(page) — la sesión recién logueada
		// necesita el warm-up de un request del SPA; el reload interno del extractor lo dispara.
		return cancelTravel(page, travelId);
	});
}
