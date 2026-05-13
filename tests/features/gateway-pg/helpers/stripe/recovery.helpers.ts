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
 * Crea un viaje con tarjeta 3DS que dispara FAIL_3DS y completa el fallo.
 *
 * Regla de negocio card 9235 + Hold ON: tras `completeFail`, el viaje se crea
 * directamente en NO_AUTORIZADO (visible en columna "En conflicto" del dashboard).
 * No aparece pop-up MAGIIS. El retry 3DS se dispara desde el detalle del viaje.
 *
 * Stripe-specific: usa `STRIPE_TEST_CARDS.fail3DS` + `ThreeDSModal` (iframe Stripe).
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
		cardLast4: STRIPE_TEST_CARDS.fail3DS.slice(-4)
	});
	await travel.submit();

	await threeDS.waitForVisible();
	await threeDS.completeFail();
	await threeDS.waitForHidden();

	return extractTravelIdFromUrl(page);
}
