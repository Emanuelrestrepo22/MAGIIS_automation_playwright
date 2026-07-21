/**
 * BL-044 — Piloto visual regression para modal 3DS Stripe.
 *
 * Estado: test.fixme() — requiere baseline generado en ambiente live.
 * Ver tests/features/gateway-pg/specs/visual/README.md para política de baselines.
 *
 * NO ejecutar sin haber generado baseline previamente con --update-snapshots.
 *
 * KATA conformance (feature/kata-conformance): test/expect del fixture unificado KATA
 * (@TestFixture) en vez de TestBase; el fixture no define `role` (login explícito en el
 * flujo cuando se implemente el baseline). Placeholder fixme — sin ATC aún (no hay flujo
 * disparado). Al implementar, reutilizar `ThreeDsChallengePage` (@ui) para localizar el
 * frame del challenge y mapear al área 3DS del idmap (MG-152/153, Level UI) — mapeo por área aceptado.
 */
import { test, expect } from '@TestFixture';

test.describe('[BL-044] Visual regression — Modal 3DS Stripe @gateway @visual @stripe @3ds @regression', () => {
	// El fixture KATA no define la opción `role` (login explícito en el flujo cuando se implemente).
	test.use({ storageState: undefined });

	test('modal 3DS challenge — layout visual', async ({ page }) => {
		test.fixme(true, 'BL-044 piloto: requiere baseline generado en ambiente live. Ver tests/features/gateway-pg/specs/visual/README.md §"Política de baselines".');

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
