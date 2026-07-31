/**
 * KATA Component (Layer 3) — Carrier · Global Integrations (App Store) · Pasarela Stripe.
 *
 * SCAFFOLDING MG-178 (área CFG). Fuente real del FE (`magiis-fe`, branch release/v1.72.x):
 *   `src/app/carrier/global-integrations/global-integrations.{ts,html}` (selector `app-global-integrations`,
 *   ruta carrier `/integrations`). Stripe vive en la sección Payment Interfaces (card `item.company == 'Stripe'`).
 *
 * ⚠️ MISMATCH DE PRODUCTO vs TCs (TS-STRIPE-TC1001-1008): en el FE Stripe se vincula por
 * **OAuth redirect** (sin formulario de credenciales) y **NO tiene popup de desvinculación**
 * (a diferencia de Authorize.Net/EBizCharge que sí usan modales de credenciales). Estados:
 *   - `stripeUri` con valor  → enlace VERDE "verify" (redirige a OAuth = vincular).
 *   - `stripeUri == null`    → enlace ROJO "unlink" (llama `stripe()` = desvincular directo, sin popup).
 *   - `isDisabledPayment('Stripe')` → texto "not_available".
 * Por eso TC1002-1005 (credenciales + popup) requieren REDISEÑO contra el flujo OAuth real; el
 * callback `?code=` externo de Stripe no es automatizable end-to-end sin mock. Selectores débiles
 * (enlaces sin id/data-*): se localiza por la card cuyo subtítulo es "Stripe".
 */

import type { Locator } from '@playwright/test';

import { expect } from '@playwright/test';
import { step } from '@utils/decorators';
import { UiBase } from '@ui/UiBase';

export class CarrierGlobalIntegrationsPage extends UiBase {
	/** Card de la integración Stripe (localizada por su subtítulo). */
	private get stripeCard(): Locator {
		return this.page
			.locator('.card')
			.filter({ has: this.page.locator('.card-subtitle', { hasText: /^Stripe$/i }) })
			.first();
	}
	/** Enlace vincular (verde, i18n `carrier.preferences.verify`). */
	private get linkAction(): Locator {
		return this.stripeCard.locator('a.green-text');
	}
	/** Enlace desvincular (rojo, i18n `carrier.preferences.unlink`). */
	private get unlinkAction(): Locator {
		return this.stripeCard.locator('a.red-text');
	}

	/** Navega al App Store / integraciones del portal carrier (baseURL de la config). */
	@step
	async goto(): Promise<void> {
		await this.page.goto('/#/home/carrier/integrations');
		await expect(this.stripeCard).toBeVisible({ timeout: 15_000 });
	}

	/** TC1001: Stripe NO vinculada → debe verse el enlace de vinculación (verify). */
	@step
	async expectUnlinked(): Promise<void> {
		await expect(this.linkAction).toBeVisible({ timeout: 10_000 });
	}

	/** Estado vinculado → debe verse el enlace de desvinculación (unlink). */
	@step
	async expectLinked(): Promise<void> {
		await expect(this.unlinkAction).toBeVisible({ timeout: 10_000 });
	}

	/**
	 * TODO(MG-178 · CFG): vincular Stripe dispara OAuth redirect a dominio externo de Stripe
	 * (`environment.stripeRedirectUri`), cuyo callback `?code=` no es automatizable end-to-end sin
	 * mock. TC1002/1003 (credenciales) NO aplican a Stripe (es OAuth). Requiere REDISEÑO de TCs.
	 */
	@step
	async startLink(): Promise<void> {
		await expect(this.linkAction).toBeVisible({ timeout: 10_000 });
		throw new Error('TODO(MG-178 · CFG): vinculación Stripe es OAuth redirect externo — TCs requieren rediseño (no credenciales).');
	}
}
