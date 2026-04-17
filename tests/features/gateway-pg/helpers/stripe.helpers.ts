import type { Page } from '@playwright/test';
import {
	NewTravelPage,
	ThreeDSModal,
	ThreeDSErrorPopup,
	OperationalPreferencesPage
} from '../../../pages/carrier';
import { STRIPE_TEST_CARDS } from '../data/stripeTestData';

/**
 * Espera el URL post-submit del alta de viaje.
 *
 * Comportamiento real (confirmado 2026-04-16):
 *   - Alta OK (hold procedió sin bloqueo):  /travel/create?limitExceeded=false
 *   - Límite excedido (hold bloqueado):     /travel/create?limitExceeded=true
 *   - Detalle de viaje (al clickear en dashboard): /travels/{id}
 *
 * La URL `?limitExceeded=false` es el caso NORMAL post-alta — NO es error.
 * El estado real del hold (éxito o "no autorizado") se valida después
 * en el dashboard de viajes (columna "Por Asignar" vs "En conflicto").
 *
 * Para tarjetas sin 3DS el hold ocurre internamente en Stripe — sin popup
 * ni request visible desde el test. La validación del hold se hace:
 *   - Stripe dashboard (externo), o
 *   - MAGIIS dashboard: "Por Asignar"+"Buscando conductor" (OK) vs
 *     "En conflicto"+"No autorizado" (hold falló)
 *
 * @returns travelId si el URL es `/travels/{id}`, string vacío si el URL es
 *          `?limitExceeded=false` (usar captureCreatedTravelId para obtener el ID en ese caso).
 * @throws Si URL contiene `limitExceeded=true` o el timeout se agota.
 */
export async function waitForTravelCreation(page: Page, timeout = 15_000): Promise<string> {
	const limitExceededPattern = /limitExceeded=(true|false)/;
	const detailPattern = /\/travels\/[\w-]+/;

	await Promise.race([
		page.waitForURL(limitExceededPattern, { timeout }),
		page.waitForURL(detailPattern, { timeout }),
	]);

	const url = page.url();
	if (/limitExceeded=true/.test(url)) {
		throw new Error(
			`[limitExceeded=true] Backend rechazó el alta por límite excedido. URL: ${url}`,
		);
	}
	// Si el URL contiene /travels/{id}, extraer el ID. Si no, retornar string vacío
	// (callers deben usar captureCreatedTravelId para obtener el travelId post-submit).
	const match = url.match(/\/travels\/([\w-]+)/);
	return match ? match[1] : '';
}

/** @deprecated waitForTravelCreation retorna '' cuando URL es `limitExceeded=false` — usar captureCreatedTravelId */
export async function extractTravelIdFromUrl(page: Page): Promise<string> {
	return waitForTravelCreation(page);
}

export async function setupTravelWithFailed3DS(
	page: Page,
	opts: { client?: string; passenger: string; origin: string; destination: string }
): Promise<string> {
	const preferences = new OperationalPreferencesPage(page);
	const travel = new NewTravelPage(page);
	const threeDS = new ThreeDSModal(page);
	const popup = new ThreeDSErrorPopup(page);

	await preferences.goto();
	await preferences.ensureHoldEnabled();
	await travel.goto();
	await travel.fillMinimum({
		...opts,
		cardLast4: STRIPE_TEST_CARDS.fail3DS.slice(-4)
	});
	await travel.submit();

	await threeDS.waitForVisible();
	await threeDS.completeFail();
	await popup.waitForVisible();
	await popup.accept();

	return extractTravelIdFromUrl(page);
}
