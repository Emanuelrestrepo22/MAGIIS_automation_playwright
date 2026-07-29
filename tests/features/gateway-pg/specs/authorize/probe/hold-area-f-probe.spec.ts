/**
 * PROBE — área F (cobro / hold): ¿qué hace MAGIIS con el viaje cuando Authorize declina?
 * =======================================================================================
 *
 * Cierra el hueco que la ronda 3 dejó declarado a propósito (`docs/gateway-pg/authorize/RUN-LOG.md`,
 * "Lo que sigue SIN estar verificado"): el alta de tarjeta (área C) de `DECLINE_AUTHORIZE`,
 * `DECLINE_INVALID_CVC` y `DECLINE_PREPAID_ZERO_BALANCE` **aprueba** —observado en vivo, porque en
 * Authorize.net el ZIP y el CVV son campos de la RESPUESTA DE AUTORIZACIÓN (AVS / CVV2) y se evalúan
 * en la transacción—, así que el rechazo, si existe, sólo puede manifestarse acá: en el hold.
 *
 * Y también observa `HAPPY_PARTIAL_AUTH` (ZIP 46225 → Authorize autoriza sólo USD 1.23 del total),
 * el único intent soportado por la pasarela que sigue skipeando "sin oráculo" en la matriz.
 *
 * ═══ POR QUÉ ES UN PROBE Y NO UN SPEC ═══
 *
 * `expectedTravelStatus: 'No autorizado'` es hoy `documented-class`: nadie corrió el hold con estas
 * tarjetas. Escribir el assert primero y ajustarlo después es exactamente el anti-patrón que la
 * ronda 3 vino a corregir. Este archivo **MIDE**: no asserta nada de negocio, reporta lo que pasó, y
 * el oráculo se declara en `helpers/journey-outcome.ts` recién con ese dato.
 *
 * ═══ SOBRE LOS PRIMITIVOS DE MEDICIÓN (leer antes de editar) ═══
 *
 * `isVisible()` / `count()` NO esperan: sirven para MUESTREAR un instante, nunca para esperar un
 * estado. Y en este flujo el `disabled` de un botón no marca el fin de un round-trip (hallazgo 5 de
 * la ronda 3). El único evento que cierra el ciclo es la **respuesta HTTP**, así que el probe
 * registra la red y usa `waitFor({state:'visible'})` / `waitForURL` cuando necesita esperar.
 *
 * ═══ ESTE PROBE CREA VIAJES REALES ═══
 *
 * A diferencia de la matriz del área C (que nunca submitea), acá se envía el servicio. Cada caso
 * captura su `travelId` del `POST /carriers/{id}/travels` y lo **cancela en el `finally`**, incluso
 * si el caso falla. El id queda logueado siempre, para poder cerrarlo a mano si la cancelación
 * fallara.
 *
 * Tag `@probe` a propósito: fuera de `@gateway`/`@authorize`, no entra en la regresión.
 */
import type { Page } from '@playwright/test';

import { test, expect } from '@TestFixture';
import { CarrierDashboardPage, CarrierNewTravelPage, CarrierOperationalPreferencesPage, CarrierTravelManagementPage } from '@ui/carrier';
import { cardFormFor } from '@ui/carrier/card-forms';
import { intentSupport, type CardIntent } from '@fixtures/gateways/_shared';
import { getGatewayPgAdapter } from '@features/gateway-pg/helpers/adapters';
import { loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { cleanupGatewayCardByLast4 } from '@features/gateway-pg/helpers/card-precondition';
import { captureCreatedTravelId, cancelTravelIfCreated, type TravelIdRef } from '@features/gateway-pg/helpers/travel-cleanup';
import { waitForTravelCreation } from '@features/gateway-pg/helpers/journey-url.helpers';

const LOG = '[PROBE][HOLD-AREA-F]';

/** Tarjeta tal como la lista `paymentMethodsByPax` — sólo los campos que el guard mira. */
type InventarioTarjeta = { id: number; defaultCard: boolean; lastFourDigits: string };

/**
 * Control positivo + los 3 declines del área F + la autorización parcial.
 * El control va PRIMERO: sin la línea de base del hold aprobado no se puede distinguir
 * "el decline no se manifiesta en ningún área" de "el decline se manifiesta distinto".
 */
const INTENTS_UNDER_OBSERVATION: readonly { intent: CardIntent; role: 'control' | 'decline' | 'partial' }[] = [
	{ intent: 'HAPPY_NO_AUTH', role: 'control' },
	{ intent: 'DECLINE_AUTHORIZE', role: 'decline' },
	{ intent: 'DECLINE_INVALID_CVC', role: 'decline' },
	{ intent: 'DECLINE_PREPAID_ZERO_BALANCE', role: 'decline' },
	{ intent: 'HAPPY_PARTIAL_AUTH', role: 'partial' }
];

/** Texto visible de la página, por líneas no vacías. */
async function visibleLines(page: Page): Promise<string[]> {
	const raw = await page.evaluate(() => document.body.innerText ?? '').catch(() => '');
	return raw
		.split('\n')
		.map(line => line.trim())
		.filter(line => line.length > 0);
}

/** Líneas presentes en `now` que no estaban en `baseline` — el copy que APARECIÓ. */
function newLines(baseline: readonly string[], now: readonly string[]): string[] {
	const before = new Set(baseline);
	return now.filter(line => !before.has(line));
}

test.describe('[PROBE] área F de Authorize — qué estado toma el viaje cuando la pasarela declina @probe', () => {
	test.describe.configure({ mode: 'serial', timeout: 420_000 });
	test.use({ storageState: { cookies: [], origins: [] } });

	for (const { intent, role } of INTENTS_UNDER_OBSERVATION) {
		const support = intentSupport('authorize', intent);
		const etiqueta = support.supported ? `•••• ${support.card.last4}` : 'N/A';

		test(`@probe ${role.toUpperCase()} ${intent} (${etiqueta})`, async ({ page }) => {
			if (!support.supported) {
				console.log(`${LOG} ${intent} → N/A en la matriz: ${support.reason}`);
				return;
			}

			const adapter = getGatewayPgAdapter('authorize');
			const defaults = adapter.journeyDefaults;
			const card = support.card;
			const passenger = defaults.appPaxPassenger;

			// ── Captura de red: el único evento que marca el fin de cada round-trip ──
			const netLog: string[] = [];
			// Inventario de tarjetas del pax, tomado de la última respuesta de
			// `paymentMethodsByPax`. Es el GUARD DE ATRIBUCIÓN del probe: si el pax tiene más de
			// una tarjeta, el alta de viaje puede cobrar la `defaultCard` en vez de la que dispara
			// el intent, y entonces el estado del viaje NO es atribuible al intent. Pasó en vivo
			// (ronda 4: una tarjeta 4706 del happy path sobrevivió al cleanup y quedó default).
			// Holder mutable (no `let` suelto): TS estrecha a `never` una variable que sólo se asigna
			// dentro del callback del listener, y el guard dejaría de compilar.
			const inventario: { cards: InventarioTarjeta[] | null } = { cards: null };
			let t0 = Date.now();
			page.on('response', response => {
				const request = response.request();
				if (request.method() === 'GET') return;
				const url = response.url();
				if (!/travel|hold|card|payment|preauth|authorize|token|valid|odn/i.test(url)) return;
				const offset = Date.now() - t0;
				void response
					.text()
					.then(body => {
						netLog.push(`t+${offset}ms ${request.method()} ${response.status()} ${url}\n      body: ${body.slice(0, 700)}`);
						if (!/paymentMethodsByPax/.test(url)) return;
						try {
							const parsed = JSON.parse(body) as { cards?: InventarioTarjeta[] };
							inventario.cards = parsed.cards ?? [];
						} catch {
							/* cuerpo no-JSON: el inventario queda como estaba */
						}
					})
					.catch(() => netLog.push(`t+${offset}ms ${request.method()} ${response.status()} ${url} (body no legible)`));
			});

			console.log(
				`\n${LOG} ═══ ${intent} (${role}) — PAN ${card.number} · CVV ${card.cvc} · ZIP ${card.zip ?? '—'} · pax "${passenger}" ═══`
			);

			// Retry del login ante el flake de auth de apps-test (mismo patrón que la factory del área C).
			await expect(async () => {
				await loginAsDispatcher(page, { gateway: 'authorize' });
			}).toPass({ timeout: 120_000, intervals: [2_000, 4_000, 8_000] });

			// Todas las tarjetas de Authorize comparten el PAN 4111…1111: sin este cleanup el alta
			// puede fallar por "tarjeta ya vinculada" y ese error se confundiría con un rechazo de la
			// pasarela (confusor documentado en el RUN-LOG, ronda 2).
			await cleanupGatewayCardByLast4(page, defaults.paxSearchQueries, card.last4);

			const dashboard = new CarrierDashboardPage({ page });
			const travel = new CarrierNewTravelPage({ page });
			const preferences = new CarrierOperationalPreferencesPage({ page });
			const management = new CarrierTravelManagementPage({ page });

			// Precondición del área F: el hold DEBE estar activo, sino no hay pre-autorización que
			// declinar y el probe mediría otro flujo. Mismo camino que el piloto verde de hold.
			await preferences.goto();
			await preferences.ensureHoldEnabled();
			await preferences.assertHoldEnabled();

			let travelIdRef: TravelIdRef | null = null;
			try {
				travelIdRef = await captureCreatedTravelId(page);

				await dashboard.openNewTravel();
				await travel.ensureLoaded();
				await travel.fillPlain({
					client: passenger,
					passenger,
					origin: defaults.origin,
					destination: defaults.destination
				});
				await travel.selectPaymentMethod('Preautorizada');
				await cardFormFor('authorize').fill(page, card);

				// ── Área C: se MIDE, no se asserta, y NO se usa como compuerta ──
				// Primera versión de este probe gateaba con `getByText(...).first().waitFor(visible)`.
				// Si el copy matchea más de un nodo y el primero está oculto, ese wait expira aunque
				// el cartel esté visible en otro nodo: la compuerta medía el índice 0, no el estado.
				// Acá se muestrea el CONTEO y la visibilidad POR NODO, más el texto nuevo, y el
				// journey sigue igual: el discriminador del área F es la red, no un cartel.
				const baseAlta = await visibleLines(page);
				const exito = page.getByText(/Tarjeta v[áa]lida|Valid card|Card valid/i);
				t0 = Date.now();
				await page.getByRole('button', { name: /^(Valid|Validar)$/i }).click();
				for (const at of [3_000, 10_000, 20_000] as const) {
					const espera = at - (Date.now() - t0);
					if (espera > 0) await page.waitForTimeout(espera); // reloj del probe: se MIDE en t fijos
					const total = await exito.count().catch(() => -1);
					const visibles: boolean[] = [];
					for (let i = 0; i < Math.max(total, 0); i++) visibles.push((await exito.nth(i).isVisible().catch(() => false)) === true);
					const nuevo = newLines(baseAlta, await visibleLines(page));
					console.log(
						`${LOG} área C  t+${at} | nodos "Tarjeta válida"=${total} | visibles=${JSON.stringify(visibles)} | ` +
							`nuevo=${nuevo.length ? JSON.stringify(nuevo) : '—'}`
					);
				}

				// ── Guard de atribución: una sola tarjeta, sino la medición no sirve ──
				// No es una aserción de negocio: es la condición sin la cual el estado del viaje no
				// se puede atribuir a ESTE intent. Si no se cumple, el probe corta ANTES del submit
				// (así tampoco crea un viaje que no mediría nada).
				const activas = (inventario.cards ?? []).filter(c => c.lastFourDigits === card.last4);
				console.log(
					`${LOG} guard — tarjetas ${card.last4} del pax: ${activas.length} ` +
						`(${activas.map(c => `id=${c.id}/default=${c.defaultCard}`).join(', ') || 'inventario no leído'})`
				);
				if (activas.length !== 1) {
					console.log(
						`${LOG} guard — MEDICIÓN NO ATRIBUIBLE: con ${activas.length} tarjetas el alta puede cobrar la ` +
							'defaultCard en vez de la del intent. Se corta ANTES del submit (sin crear viaje). Re-correr tras limpiar la wallet.'
					);
					return;
				}

				// ── Área F: enviar el servicio y observar qué estado toma el viaje ──
				const baseEnvio = await visibleLines(page);
				const vehiculoOk = await travel
					.waitForVehicleSelectionReady()
					.then(() => true)
					.catch(() => false);
				console.log(`${LOG} área F — "Seleccionar Vehículo" habilitado: ${vehiculoOk}`);
				if (!vehiculoOk) {
					console.log(`${LOG} área F — el journey no llega al submit: se corta acá SIN crear viaje.`);
					return;
				}
				await travel.clickSelectVehicle();
				t0 = Date.now();
				await travel.clickSendService();

				const urlPostEnvio = await waitForTravelCreation(page, 60_000)
					.then(() => page.url())
					.catch((err: Error) => `ERROR: ${err.message} (URL actual ${page.url()})`);
				console.log(`${LOG} área F — URL post-envío: ${urlPostEnvio}`);
				console.log(`${LOG} área F — texto NUEVO tras enviar: ${JSON.stringify(newLines(baseEnvio, await visibleLines(page)))}`);
				console.log(`${LOG} área F — travelId capturado: ${travelIdRef.travelId ?? 'NINGUNO (el POST /travels no devolvió travelId)'}`);

				// ── Estado del viaje: se lee del DETALLE por travelId ──
				// El selector `statusBadge()` del POM legacy está marcado TODO/no validado, así que el
				// probe NO lo usa: navega al detalle y volcá el TEXTO de la página. El estado sale del
				// texto observado, no de un locator sin confirmar.
				if (travelIdRef.travelId != null) {
					await page.goto(`${new URL(page.url()).origin}/#/home/carrier/travels/${travelIdRef.travelId}`);
					await page.waitForLoadState('domcontentloaded');
					await page.waitForTimeout(6_000); // el detalle hidrata por API; se muestrea una vez asentado
					const detalle = await visibleLines(page);
					console.log(`${LOG} detalle viaje ${travelIdRef.travelId} — texto: ${JSON.stringify(detalle.slice(0, 80))}`);
					console.log(
						`${LOG} detalle viaje ${travelIdRef.travelId} — líneas con estado: ` +
							JSON.stringify(detalle.filter(l => /No autorizado|Buscando|autoriz|conflicto|Pendiente/i.test(l)))
					);
				}

				// ── Grilla de gestión: se vuelcan las pestañas y su contenido, sin asumir cuál ──
				await management.goto();
				const tabs = await page.locator('tabset ul li a').allTextContents().catch(() => []);
				console.log(`${LOG} gestión — pestañas: ${JSON.stringify(tabs.map(t => t.trim()).filter(Boolean))}`);
				const idViaje = travelIdRef.travelId != null ? String(travelIdRef.travelId) : null;
				const dumpTab = async (nombre: string) => {
					const lineas = await visibleLines(page);
					console.log(
						`${LOG} gestión[${nombre}] — travelId ${idViaje ?? '—'} presente: ${idViaje ? lineas.some(l => l.includes(idViaje)) : 'n/a'} · ` +
							`líneas con "No autorizado": ${JSON.stringify(lineas.filter(l => /No autorizado/i.test(l)).slice(0, 5))} · ` +
							`líneas con el pax: ${JSON.stringify(lineas.filter(l => new RegExp(passenger.split(/[\s,]+/)[0], 'i').test(l)).slice(0, 5))}`
					);
				};
				await dumpTab('default');
				const tabConflicto = page
					.locator('tabset ul li a')
					.filter({ hasText: /en conflicto/i })
					.first();
				if (await tabConflicto.count()) {
					await tabConflicto.click();
					await page.waitForSelector('table tbody', { state: 'visible', timeout: 15_000 }).catch(() => {});
					await dumpTab('En conflicto');
				} else {
					console.log(`${LOG} gestión — no existe pestaña "En conflicto" en la vista`);
				}
			} finally {
				console.log(`${LOG} respuestas de red del journey (${netLog.length}):`);
				for (const line of netLog) console.log(`${LOG}   ${line}`);
				if (travelIdRef) {
					const id = travelIdRef.travelId;
					const cancelado = await cancelTravelIfCreated(page, travelIdRef);
					console.log(`${LOG} CLEANUP — travelId=${id ?? 'ninguno'} · cancelado=${cancelado}`);
				}
			}
		});
	}
});
