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
		dispose: async () => {
			page.off('response', handler);
		}
	};

	// Acepta tanto /carriers/{id}/travels como /contractors/{id}/travels
	// para cubrir el portal contractor que puede usar su propio prefijo.
	const endpointPattern = new RegExp(`/magiis-v0\\.2/(carriers|contractors)/${carrierId}/travels(?:[/?]|$)`);

	const handler = async (response: Response) => {
		try {
			const request = response.request();
			// Cachear token de cualquier API request (para usarlo en cancelTravel)
			const authHeader = request.headers()['authorization'];
			if (authHeader && response.url().includes('/magiis-v0.2/')) {
				cacheAuthToken(page, authHeader);
			}

			if (request.method() !== 'POST') return;
			if (!endpointPattern.test(response.url())) return;
			if (!response.ok()) return;

			const body = await response.json().catch(() => null);
			if (body && typeof body.travelId === 'number') {
				ref.travelId = body.travelId;
				console.log(`[travel-cleanup] Capturado travelId=${body.travelId}`);
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
export async function cancelTravel(
	page: Page,
	travelId: number,
	opts: {
		carrierId?: string;
		carrierUserId?: string;
		carrierName?: string;
		reason?: string;
	} = {}
): Promise<boolean> {
	const carrierId = opts.carrierId ?? DEFAULT_CARRIER_ID;
	const carrierUserId = opts.carrierUserId ?? DEFAULT_CARRIER_USER_ID;
	const carrierName = opts.carrierName ?? DEFAULT_CARRIER_NAME;
	const reason = opts.reason ?? '';

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
		console.warn(`[travel-cleanup] cancelTravel ${travelId} failed: ${response.status()} ${response.statusText()}`);
		return false;
	}
	console.log(`[travel-cleanup] ✓ Viaje ${travelId} cancelado`);
	return true;
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
