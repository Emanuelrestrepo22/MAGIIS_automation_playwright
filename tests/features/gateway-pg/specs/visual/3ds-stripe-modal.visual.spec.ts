/**
 * BL-044 — Piloto visual regression para modal 3DS Stripe.
 *
 * Estado: test.fixme() — requiere baseline generado en ambiente live.
 * Ver tests/features/gateway-pg/specs/visual/README.md para política de baselines.
 *
 * NO ejecutar sin haber generado baseline previamente con --update-snapshots.
 */
import { test, expect } from '../../../../TestBase';

test.describe('[BL-044] Visual regression — Modal 3DS Stripe @visual @stripe @3ds', () => {
	test.use({ role: 'carrier' });

	test('modal 3DS challenge — layout visual', async ({ page }) => {
		test.fixme(
			true,
			'BL-044 piloto: requiere baseline generado en ambiente live. Ver tests/features/gateway-pg/specs/visual/README.md §"Política de baselines".'
		);

		// TODO(BL-044): completar flujo de disparo del modal 3DS con tarjeta 4000 0025 0000 3155.
		//   Reutilizar helpers de specs/stripe/web/carrier/recovery cuando se genere el baseline.
		//   Patrón esperado:
		//     1. Login carrier (storageState).
		//     2. Navegar a /travel/create.
		//     3. Llenar mínimo + tarjeta 4000 0025 0000 3155.
		//     4. Submit → modal 3DS aparece.
		//     5. Capturar visual del frame del challenge.

		const threeDsFrame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();

		await expect(threeDsFrame.locator('body')).toHaveScreenshot('3ds-stripe-challenge.png', {
			maxDiffPixelRatio: 0.02,
			animations: 'disabled',
			caret: 'hide'
		});
	});
});
