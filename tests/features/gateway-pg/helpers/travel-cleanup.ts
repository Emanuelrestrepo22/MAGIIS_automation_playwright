/**
 * travel-cleanup.ts — Helpers de limpieza de viajes creados durante tests.
 *
 * Cada hold/travel que se crea consume el límite del pasajero por día en Stripe.
 * Si no se cancela, los tests subsiguientes fallan con limitExceeded=false por
 * acumulación de holds pending.
 *
 * Flujo de uso:
 *   1. Antes del submit, instalar `capturedTravelIdRef = captureCreatedTravelId(page)`
 *   2. Submit el viaje (el backend responde con travelId)
 *   3. En afterEach: `await cancelTravelIfCreated(page, capturedTravelIdRef)`
 *
 * Endpoints:
 *   - POST /magiis-v0.2/carriers/{carrierId}/travels → { travelId }
 *   - PUT  /magiis-v0.2/carriers/{carrierId}/travels/{travelId}/cancel
 */
import type { Page, Response } from '@playwright/test';
import { cacheAuthToken, getApiHeaders } from './card-precondition';
import { debugLog } from '@helpers/index';

/**
 * IDs por defecto del carrier dispatcher utilizado en TEST (remises.eeuu).
 *
 * Estos valores **no son secretos** — son identificadores numéricos visibles
 * en el payload del PUT /travels/{id}/cancel y se requieren para que el
 * backend acepte la cancelación. Se exponen como overridables vía env vars
 * para permitir correr la suite contra otro carrier (UAT / cuenta alterna)
 * sin tocar código:
 *
 *   - CARRIER_ID            (default '1521')   — carrier owner del viaje
 *   - CARRIER_USER_ID       (default '6715')   — user dispatcher que cancela
 *   - CARRIER_DISPLAY_NAME  (default '  Remises EEUU') — name del payload
 *
 * Evidencia: payload real capturado del request /cancel del portal carrier
 * con login DISPATCHER de TEST (`USER_CARRIER` / `PASS_CARRIER`).
 *
 * BL-009 Fase 4 — el fallback hardcoded se mantiene a propósito: estos IDs
 * son estables para el ambiente TEST y no clasifican como credenciales.
 * Si en el futuro varían por test/ambiente, refactorizar a resolución
 * dinámica via API (`GET /users/me`) o vía fixture en `tests/fixtures/users/`.
 */
const DEFAULT_CARRIER_ID = process.env.CARRIER_ID ?? '1521';
const DEFAULT_CARRIER_USER_ID = process.env.CARRIER_USER_ID ?? '6715';
const DEFAULT_CARRIER_NAME = process.env.CARRIER_DISPLAY_NAME ?? '  Remises EEUU';

function resolveApiBase(page: Page): string {
	const baseUrl = process.env.BASE_URL ?? new URL(page.url()).origin;
	return `${baseUrl}/magiis-v0.2`;
}

/** Ref mutable para compartir travelId entre el interceptor y el afterEach */
export interface TravelIdRef {
	travelId: number | null;
	/**
	 * Código WEB del viaje (`travelIdForCarrier` del DTO) — la grilla de Gestión de Viajes
	 * lo muestra como "NNNN-W". Permite anclar la FILA del viaje recién creado en el
	 * dashboard (v1.72.8 eliminó las anclas `a[href*="/travels/"]` de la grilla).
	 */
	travelIdForCarrier: number | null;
	dispose: () => Promise<void>;
}

/**
 * Instala un interceptor que captura el `travelId` de la respuesta del
 * POST /magiis-v0.2/carriers/{carrierId}/travels (alta de viaje exitosa).
 *
 * Retorna un ref mutable — después del submit, ref.travelId tendrá el ID creado
 * (o null si el backend rechazó con limitExceeded).
 *
 * Llamar `ref.dispose()` cuando ya no se necesite (típicamente afterEach).
 */
export async function captureCreatedTravelId(page: Page, carrierId = DEFAULT_CARRIER_ID): Promise<TravelIdRef> {
	const ref: TravelIdRef = {
		travelId: null,
		travelIdForCarrier: null,
		dispose: async () => {
			page.off('response', handler);
		}
	};

	// Acepta /carriers/{id}/travels y /contractors/{id}/travels con CUALQUIER id.
	// El portal contractor postea a /contractors/{contractorId}/travels con un id
	// propio (≠ carrierId 1521); fijar el id al carrier hacía que el POST del
	// contractor nunca matcheara y `travelId` quedara null pese a crearse el viaje.
	void carrierId;
	const endpointPattern = /\/magiis-v0\.2\/(carriers|contractors)\/\d+\/travels(?:[/?]|$)/;

	const handler = async (response: Response) => {
		try {
			const request = response.request();
			// Cachear token de cualquier API request (para usarlo en cancelTravel)
			const authHeader = request.headers()['authorization'];
			if (authHeader && response.url().includes('/magiis-v0.2/')) {
				cacheAuthToken(page, authHeader);
			}

			if (request.method() !== 'POST') return;
			if (!endpointPattern.test(response.url())) {
				if (request.method() === 'POST' && /\/travels/i.test(response.url())) {
					debugLog('gateway-pg:travel-capture', `[skip] POST ${response.url()} no matchea endpointPattern`);
				}
				return;
			}
			if (!response.ok()) {
				debugLog(
					'gateway-pg:travel-capture',
					`[skip] POST ${response.url()} status=${response.status()} (no-ok)`
				);
				return;
			}

			const body = await response.json().catch(() => null);
			debugLog(
				'gateway-pg:travel-capture',
				`[match] POST ${response.url()} status=${response.status()} body=${JSON.stringify(body).slice(0, 200)}`
			);
			// El service FE consume `response.travelId` (travel.service.ts:410), pero la interfaz
			// del command declara `id?` (addTravelcommand.ts:33) y el DTO trae también
			// `travelIdForCarrier`. Aceptamos cualquiera de los tres, number o string-numérico,
			// para no perder la captura por diferencia de nombre/tipo entre endpoints.
			const rawId = body?.travelId ?? body?.travelIdForCarrier ?? body?.id;
			const id =
				typeof rawId === 'number'
					? rawId
					: typeof rawId === 'string' && /^\d+$/.test(rawId)
						? Number(rawId)
						: null;
			if (id !== null) {
				ref.travelId = id;
				// Código web (grilla "NNNN-W") — additive: solo si el DTO lo trae explícito.
				const rawCode = body?.travelIdForCarrier;
				ref.travelIdForCarrier =
					typeof rawCode === 'number'
						? rawCode
						: typeof rawCode === 'string' && /^\d+$/.test(rawCode)
							? Number(rawCode)
							: null;
				console.log(
					`[travel-cleanup] Capturado travelId=${id}${ref.travelIdForCarrier ? ` (web ${ref.travelIdForCarrier}-W)` : ''}`
				);
			} else if (body) {
				console.warn(
					`[travel-cleanup] POST ${response.url()} 2xx sin travelId/id numérico (keys: ${Object.keys(body).join(', ')})`
				);
			}
		} catch {
			// Silenciar errores de parseo — no bloquear el test
		}
	};

	page.on('response', handler);
	return ref;
}

/**
 * Cancela un viaje via API PUT /travels/{travelId}/cancel.
 *
 * @returns true si la cancelación fue exitosa, false si falló
 */
/** Resultado granular de la cancelacion — permite distinguir blocker 5xx de estado 4xx. */
export interface CancelTravelResult {
	ok: boolean;
	status: number;
	body: string;
}

export async function cancelTravelDetailed(
	page: Page,
	travelId: number,
	opts: {
		carrierId?: string;
		carrierUserId?: string;
		carrierName?: string;
		reason?: string;
	} = {}
): Promise<CancelTravelResult> {
	const carrierId = opts.carrierId ?? DEFAULT_CARRIER_ID;
	const carrierUserId = opts.carrierUserId ?? DEFAULT_CARRIER_USER_ID;
	const carrierName = opts.carrierName ?? DEFAULT_CARRIER_NAME;
	// reason NO vacio (probe 2026-08-06): el cancel con reasonForCancellation '' devuelve 500
	// SQLGrammarException en TEST — descartar que el backend arme mal el SQL con reason vacio.
	const reason = opts.reason ?? 'QA automation cleanup';

	const apiBase = resolveApiBase(page);
	const url = `${apiBase}/carriers/${carrierId}/travels/${travelId}/cancel`;
	const headers = await getApiHeaders(page);

	const response = await page.request.put(url, {
		data: {
			travelId,
			carrierUserId,
			reasonForCancellation: reason,
			canceledBy: 'CARRIER',
			name: carrierName,
			userId: carrierUserId,
			checkPassengerCancelation: false
		},
		headers
	});

	if (!response.ok()) {
		// Body incluido en el diagnostico (fix 2026-08-05): un `false` sin causa obligaba a
		// re-reproducir para saber si fue 401 (token), 404 (id ajeno) o 4xx de estado del viaje.
		const body = await response.text().catch(() => '(body ilegible)');
		console.warn(
			`[travel-cleanup] cancelTravel ${travelId} failed: ${response.status()} ${response.statusText()} — ${body.slice(0, 300)}`
		);
		return { ok: false, status: response.status(), body: body.slice(0, 300) };
	}
	console.log(`[travel-cleanup] ✓ Viaje ${travelId} cancelado`);
	return { ok: true, status: response.status(), body: '' };
}

/** Wrapper boolean retro-compatible (callers legacy/cleanups best-effort). */
export async function cancelTravel(
	page: Page,
	travelId: number,
	opts: Parameters<typeof cancelTravelDetailed>[2] = {}
): Promise<boolean> {
	return (await cancelTravelDetailed(page, travelId, opts)).ok;
}

/**
 * Si el ref capturó un travelId, cancela el viaje. No falla si no hay travelId.
 * Uso típico en afterEach para limpiar holds acumulados.
 */
export async function cancelTravelIfCreated(
	page: Page,
	ref: TravelIdRef,
	opts: Parameters<typeof cancelTravel>[2] = {}
): Promise<boolean> {
	await ref.dispose();
	if (ref.travelId == null) return false;
	try {
		return await cancelTravel(page, ref.travelId, opts);
	} catch (err) {
		console.warn(`[travel-cleanup] Error cancelando travel ${ref.travelId}:`, err);
		return false;
	}
}
