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

const DEFAULT_CARRIER_ID = process.env.CARRIER_ID ?? '1521';

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

	const res = await page.request.post(`${apiBase(page)}/carriers/${carrierId}/parameters`, { headers, data: params });
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
