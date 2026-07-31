/**
 * KATA Component (Layer 3) — Carrier · Card Form Strategy: Stripe Elements.
 *
 * Seam S3 (carrier/gateway-standardization): lógica de iframes EXTRAÍDA de
 * `NewTravelPageBase.fillPreauthorizedCard` (deuda TIER A — BL-038 Strategy Pattern).
 * El método legacy queda como wrapper delegando acá — CERO cambios para sus
 * consumidores (misma secuencia: espera de montaje → 3 iframes → holder/ZIP nativos).
 *
 * Stripe Elements monta 3 iframes (cardNumber/cardExpiry/cardCvc) identificables por
 * el query param `componentName=` de su URL; number/expiry/cvc viven DENTRO de los
 * iframes, holder y ZIP (avsZipcode) son inputs nativos de la página.
 */

import type { Frame, Locator, Page } from '@playwright/test';
import type { CardFormFillInput, CardFormStrategy } from './CardFormStrategy';

type StripeComponentName = 'cardNumber' | 'cardExpiry' | 'cardCvc';

export class StripeElementsCardForm implements CardFormStrategy {
	readonly kind = 'stripe-elements' as const;

	/** Polling propio: el iframe de Stripe no emite evento DOM de aparición. */
	private async waitForStripeFrame(page: Page, component: StripeComponentName, timeoutMs = 15_000): Promise<Frame> {
		const deadline = Date.now() + timeoutMs;

		while (Date.now() < deadline) {
			const frame = page.frames().find(candidate => candidate.url().includes(`componentName=${component}`));
			if (frame) {
				return frame;
			}

			// NOTE(tier3-kept): polling loop propio — Stripe iframe no emite evento DOM de aparición
			await page.waitForTimeout(250);
		}

		throw new Error(`Stripe frame not found: ${component}`);
	}

	async fill(page: Page, card: CardFormFillInput): Promise<void> {
		// NOTE(tier3-kept): Stripe monta 3 iframes (cardNumber/cardExpiry/cardCvc) sin evento DOM de "ready"; reducir causa waitForStripeFrame timeout
		await page.waitForTimeout(2_500);

		const numberFrame = await this.waitForStripeFrame(page, 'cardNumber');
		const expiryFrame = await this.waitForStripeFrame(page, 'cardExpiry');
		const cvcFrame = await this.waitForStripeFrame(page, 'cardCvc');

		// MG-178: los 3 campos DENTRO de los iframes se tipean char-por-char, no con `fill()`.
		// Stripe Elements no siempre registra el `fill()` programático: deja el campo en estado
		// "incompleto" y el botón "Validar" del POM nunca habilita. `pressSequentially` dispara los
		// listeners internos de Stripe. El `click()` + `fill('')` previo limpia el residuo de un
		// intento anterior, porque el POM reintenta el llenado hasta que "Validar" habilite.
		// Holder y ZIP son inputs nativos de Angular: no necesitan el tipeo lento.
		const iframeFields: Array<[Locator, string]> = [
			[numberFrame.locator('input[name="cardnumber"]'), card.number],
			[expiryFrame.locator('input[name="exp-date"]'), card.expiry],
			[cvcFrame.locator('input[name="cvc"]'), card.cvc]
		];
		for (const [input, value] of iframeFields) {
			await input.click();
			await input.fill('');
			await input.pressSequentially(value, { delay: 30 });
		}

		await page.locator('input[formcontrolname="creditCardOwnerName"]').fill(card.holderName);
		if (card.zip) {
			await page.locator('input[formcontrolname="avsZipcode"]').fill(card.zip);
		}
	}
}
