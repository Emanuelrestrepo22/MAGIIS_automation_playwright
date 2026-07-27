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

import type { Frame, Page } from '@playwright/test';
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

		await numberFrame.locator('input[name="cardnumber"]').fill(card.number);
		await expiryFrame.locator('input[name="exp-date"]').fill(card.expiry);
		await cvcFrame.locator('input[name="cvc"]').fill(card.cvc);
		await page.locator('input[formcontrolname="creditCardOwnerName"]').fill(card.holderName);
		if (card.zip) {
			await page.locator('input[formcontrolname="avsZipcode"]').fill(card.zip);
		}
	}
}
