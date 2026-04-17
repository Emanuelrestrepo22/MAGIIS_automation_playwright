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

const DEFAULT_CARRIER_ID = process.env.CARRIER_ID ?? '1521';
/** User ID del dispatcher carrier (remises.eeuu) — confirmado en payload de cancel */
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
export async function captureCreatedTravelId(
	page: Page,
	carrierId = DEFAULT_CARRIER_ID,
): Promise<TravelIdRef> {
	const ref: TravelIdRef = {
		travelId: null,
		dispose: async () => {
			page.off('response', handler);
		},
	};

	const endpointPattern = new RegExp(
		`/magiis-v0\\.2/carriers/${carrierId}/travels(?:\\?|$)`,
	);

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
	} = {},
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
			checkPassengerCancelation: false,
		},
		headers,
	});

	if (!response.ok()) {
		console.warn(
			`[travel-cleanup] cancelTravel ${travelId} failed: ${response.status()} ${response.statusText()}`,
		);
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
	opts: Parameters<typeof cancelTravel>[2] = {},
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

