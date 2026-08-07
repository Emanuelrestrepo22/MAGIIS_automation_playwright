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
import { NewTravelPage, OperationalPreferencesPage, ThreeDSModal } from '../../../../pages/carrier';
import { captureCreatedTravelId } from '@features/gateway-pg/helpers/travel-cleanup';
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
	// DOS VENTANAS de challenge (fix 2026-08-06, corridas recovery/conflicto): con el hold
	// ejecutandose en la VALIDACION ("Validar" = hold real), el challenge de ESA ventana al
	// fallar ABORTA el alta (no hay viaje -> no hay NO_AUTORIZADO). El estado recuperable del
	// sujeto (MG-155/TC1051..1061) nace del fallo POST-SUBMIT: se aprueba el challenge de
	// validacion (si aparece), se envia, y se RECHAZA el challenge post-envio. Si el challenge
	// post-envio NO aparece y el viaje navega igual, el camino "NO_AUTORIZADO via challenge
	// fallido" ya no existe en el producto -> el caller falla con diagnostico explicito
	// (posible CAMBIO DE PRODUCTO a reportar, no se enmascara).
	const validationChallenge = await threeDS.waitForOptionalVisible(8_000);
	if (validationChallenge) {
		await threeDS.completeSuccess();
		await threeDS.waitForHidden();
	}

	// Listener del POST /travels: el FE actual puede NO redirigir a /travels tras el challenge
	// post-envio fallido (UX nueva: error inline recuperable) — el viaje EXISTE igual (se crea
	// en el send, antes del challenge). El id capturado permite navegar al detalle por id y
	// asertar NO_AUTORIZADO sin depender del redirect (oraculo modernizado, sujeto intacto).
	const createdRef = await captureCreatedTravelId(page);
	try {
		await travel.submit();

		await threeDS.waitForVisible();
		await threeDS.completeFail();
		await threeDS.waitForHidden();

		const urlId = await Promise.race([
			extractTravelIdFromUrl(page),
			page.waitForTimeout(8_000).then(() => null)
		]).catch(() => null);
		if (urlId) return urlId;

		if (createdRef.travelId) {
			// Sin redirect pero con viaje creado: navegar al detalle por id (misma superficie).
			await page.goto(`${page.url().split('/#/')[0]}/#/home/carrier/travels/${createdRef.travelId}`);
			return String(createdRef.travelId);
		}
		throw new Error(
			'setupTravelWithFailed3DS: sin redirect a /travels NI POST /travels capturado tras fallar el challenge post-envio — ' +
				'el camino "NO_AUTORIZADO via challenge fallido" puede haber cambiado en el producto (reportar, no enmascarar).'
		);
	} finally {
		await createdRef.dispose();
	}
}
