/**
 * Stripe Recovery helpers — Stripe-specific.
 * ============================================
 *
 * Helpers que orquestan flujos de recuperación post-3DS específicos de Stripe.
 * Authorize.net NO requiere 3DS → estos helpers NO aplican a otros gateways.
 *
 * Movidos desde `stripe.helpers.ts` en 2026-05-13 (organización multi-gateway).
 */

import type { Page } from '@playwright/test';
import {
	NewTravelPage,
	OperationalPreferencesPage,
	ThreeDSModal,
} from '../../../../pages/carrier';
import { STRIPE_TEST_CARDS } from '../../data/stripeTestData';
import { extractTravelIdFromUrl } from '../journey-url.helpers';

/**
 * Crea un viaje con fallo 3DS RECUPERABLE y completa el fallo.
 *
 * Regla de negocio card threeDSRequired (4000000000003220) + Hold ON: el challenge
 * 3DS emerge y se RECHAZA vía botón FAIL → el viaje se crea directamente en
 * NO_AUTORIZADO (visible en columna "En conflicto" del dashboard). No aparece pop-up
 * MAGIIS. El retry 3DS se dispara desde el detalle del viaje y, al COMPLETAR el
 * challenge, el viaje se recupera → "Buscando conductor" (cf. TC1061).
 *
 * Se usa 3220 (recuperable, resultado según COMPLETE/FAIL) — NO fail3DS/1629, que
 * declina el cobro de forma nativa e irrecuperable (el retry volvería a declinar).
 *
 * Stripe-specific: usa `STRIPE_TEST_CARDS.threeDSRequired` + `ThreeDSModal` (iframe Stripe).
 *
 * @returns travelId del viaje creado en estado NO_AUTORIZADO.
 */
export async function setupTravelWithFailed3DS(
	page: Page,
	opts: { client?: string; passenger: string; origin: string; destination: string }
): Promise<string> {
	const preferences = new OperationalPreferencesPage(page);
	const travel = new NewTravelPage(page);
	const threeDS = new ThreeDSModal(page);

	await preferences.goto();
	await preferences.ensureHoldEnabled();
	await travel.goto();
	await travel.fillMinimum({
		...opts,
		// FIX 2026-07-21: threeDSRequired = 4000000000003220 (exige 3DS; recuperable vía
		// COMPLETE/FAIL). El fallo se logra rechazando el challenge (completeFail); el retry
		// posterior con completeSuccess recupera el viaje. (9235 no mostraba challenge; 1629
		// declina nativo → irrecuperable, romperia TC1061).
		cardLast4: STRIPE_TEST_CARDS.threeDSRequired.slice(-4)
	});
	await travel.submit();

	await threeDS.waitForVisible();
	await threeDS.completeFail();
	await threeDS.waitForHidden();

	return extractTravelIdFromUrl(page);
}
