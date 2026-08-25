/**
 * parameters-api.ts — Setup del estado de "hold" (pre-autorización) vía API.
 *
 * BL-i18n/v1.72.8: la pantalla Configuración Parámetros se reestructuró y el toggle
 * "Aplicar Pre-Autorización" NO habilita el botón Guardar ni persiste desde la UI
 * (verificado por exploratory 2026-07-20). Para no depender de la UI rota, el setup
 * de los tests de hold fija el estado vía API: GET parámetros → modifica
 * `enableCreditCardHold` (+ ccHoldPreviousHs/ccHoldCoverage) → POST del objeto completo.
 *
 * Reusa el patrón de auth de `card-precondition.ts` (token del SPA vía `getApiHeaders`).
 * Endpoint: GET/POST /magiis-v0.2/carriers/{carrierId}/parameters
 */
import type { Page } from '@playwright/test';
import { getApiHeaders } from './card-precondition';
import { retryAsync } from '../../../helpers/retry';

const DEFAULT_CARRIER_ID = process.env.CARRIER_ID ?? '1521';

// Status HTTP transitorios observados en TEST (403 intermitente 1× en MG-178, además de
// rate-limit y 5xx). Solo estos se reintentan; 400/401/404/422 son permanentes → fallan directo.
const RETRYABLE_STATUS = new Set([403, 429, 500, 502, 503, 504]);

function apiBase(page: Page): string {
	const base = process.env.BASE_URL ?? new URL(page.url()).origin;
	return `${base}/magiis-v0.2`;
}

export type CarrierParameters = Record<string, unknown> & {
	enableCreditCardHold?: boolean;
	ccHoldPreviousHs?: number;
	ccHoldCoverage?: number;
};

/** GET del objeto completo de parámetros del carrier. */
export async function getCarrierParameters(page: Page, carrierId = DEFAULT_CARRIER_ID): Promise<CarrierParameters> {
	const headers = await getApiHeaders(page);
	const res = await page.request.get(`${apiBase(page)}/carriers/${carrierId}/parameters`, { headers });
	if (!res.ok()) throw new Error(`[parameters-api] GET parameters ${res.status()} ${res.statusText()}`);
	return (await res.json()) as CarrierParameters;
}

/**
 * Fija `enableCreditCardHold` vía API (bypass del UI). Hace GET del objeto completo,
 * modifica solo los campos de hold y lo re-postea entero para no pisar el resto.
 * @returns el objeto de parámetros posteado.
 */
export async function setHoldViaApi(
	page: Page,
	enabled: boolean,
	opts: { ccHoldPreviousHs?: number; ccHoldCoverage?: number; carrierId?: string } = {}
): Promise<CarrierParameters> {
	const carrierId = opts.carrierId ?? DEFAULT_CARRIER_ID;
	const headers = await getApiHeaders(page);
	const params = await getCarrierParameters(page, carrierId);

	params.enableCreditCardHold = enabled;
	if (enabled) {
		params.ccHoldPreviousHs = opts.ccHoldPreviousHs ?? 2;
		params.ccHoldCoverage = opts.ccHoldCoverage ?? 10;
	}

	// El POST de parámetros mostró 403 transitorio en TEST (MG-178, workaround hold-enable).
	// Reintentamos SOLO en status transitorios; un status permanente devuelve la Response y
	// cae al throw detallado de abajo (retryAsync no la reintenta porque no lanzamos).
	const res = await retryAsync(
		async () => {
			const r = await page.request.post(`${apiBase(page)}/carriers/${carrierId}/parameters`, { headers, data: params });
			if (!r.ok() && RETRYABLE_STATUS.has(r.status())) {
				throw new Error(`[parameters-api] POST parameters ${r.status()} ${r.statusText()} (transitorio) — reintentando`);
			}
			return r;
		},
		// El 403 en TEST puede persistir varios segundos (bug v1.72.8 preauth-save / ventana de permisos):
		// 5 intentos con backoff incremental (~1.5+3+4.5+6 ≈ 15s) para tolerar la ventana antes de fallar.
		{ attempts: 5, delayMs: 1500, onRetry: (attempt, err) => console.warn(`[parameters-api] retry ${attempt}/4: ${err.message}`) },
	);
	if (!res.ok()) {
		const body = await res.text().catch(() => '');
		throw new Error(`[parameters-api] POST parameters ${res.status()} ${res.statusText()} — ${body.slice(0, 200)}`);
	}
	return params;
}

/**
 * Lee `enableCreditCardHold` vía API con coerción (`=== true`): campo ausente → `false`.
 * ⚠️ Para READ-BACK como oráculo usar `readHoldRaw` — la coerción convierte campo-ausente en
 * `false` (false-pass ante drift del contrato cuando se asserta el estado OFF).
 */
export async function readHoldEnabled(page: Page, carrierId = DEFAULT_CARRIER_ID): Promise<boolean> {
	return (await getCarrierParameters(page, carrierId)).enableCreditCardHold === true;
}

/**
 * Lee `enableCreditCardHold` CRUDO (sin coerción): `boolean` si el backend devuelve el campo,
 * `undefined` si está AUSENTE del contrato. Los read-backs de hold deben assertar sobre este
 * valor (`toBe(true)` / `toBe(false)`) — así un campo ausente FALLA en vez de pasar como `false`.
 */
export async function readHoldRaw(page: Page, carrierId = DEFAULT_CARRIER_ID): Promise<boolean | undefined> {
	return (await getCarrierParameters(page, carrierId)).enableCreditCardHold;
}

/**
 * Re-asegura hold=ON de forma IDEMPOTENTE y best-effort (lee primero; sólo postea si quedó OFF).
 *
 * Pensado para el `test.afterEach` de los specs que apagan el hold (review MEDIUM-4): un timeout
 * del test ABORTA el `finally` del orquestador y dejaría el carrier compartido sin hold para el
 * resto de la suite; el afterEach sí corre tras el timeout, con presupuesto propio (mismo
 * precedente de cleanup post-timeout que `hold-capture.spec.ts`). Nunca lanza: la restauración no
 * debe tapar el desenlace del test — si falla, queda el warn como diagnóstico y el próximo
 * `setHold` del orquestador corrige el estado al arrancar.
 */
export async function ensureHoldRestoredOn(page: Page, carrierId = DEFAULT_CARRIER_ID): Promise<void> {
	try {
		if ((await readHoldRaw(page, carrierId)) === true) return;
		await setHoldViaApi(page, true, { carrierId });
		console.log('[parameters-api] hold re-asegurado a ON (red de seguridad afterEach)');
	} catch (err) {
		console.warn('[parameters-api] ensureHoldRestoredOn falló (best-effort, no fatal):', err);
	}
}
