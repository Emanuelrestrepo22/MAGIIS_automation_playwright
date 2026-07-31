/**
 * [MG · G][UI] MercadoPago — fallo de `cleaningWallets` NO debe reportar éxito falso (TC-PAY-G-05).
 *
 * Bug transversal ya documentado: hoy el FE muestra un toast de ÉXITO INCONDICIONAL al
 * desvincular la pasarela, sin importar el status HTTP real de `vendor/cleaningWallets`.
 * Este spec fija el comportamiento CORRECTO (no un smoke del bug): un 500 mockeado en el
 * endpoint debe traducirse en feedback de error real y la pasarela debe seguir "linked"
 * (retryable) — NO en un éxito falso. Mientras el bug siga sin corregirse, este test FALLA
 * en rojo, capturando la regresión hasta que el fix del FE lo ponga en verde.
 *
 * Precondición: carrier ARG (USER_CARRIER_MP / PASS_CARRIER_MP) con MercadoPago YA vinculada
 * como pasarela activa (mismo carrier que usan los specs `no-hold`).
 *
 * ⚠️ NO destructivo: `AppStoreGatewaysPage.expectUnlinkFailureShowsRealError` intercepta la
 * request de `cleaningWallets` con `page.route()` ANTES de que salga del browser — el backend
 * real nunca se contacta, por lo que la pasarela del carrier NUNCA se desvincula de verdad.
 * Por esto NO se usa `AppStoreGatewaysPage.unlinkGateway()` (ese sí ejecuta el unlink real y
 * exige `AUTHORIZE_ALLOW_DESTRUCTIVE_SWITCH=true`) ni se setea ese flag acá — no aplica: esta
 * ATC nunca llega al backend.
 */
import { test, expect } from '@TestBase';
import { AppStoreGatewaysPage } from '@ui/carrier';
import { loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';

const env = process.env.ENV ?? 'test';
const CREDS_READY = Boolean(process.env.USER_CARRIER_MP && process.env.PASS_CARRIER_MP && process.env.BASE_URL);

test.describe(`[MG · G][UI][${env.toUpperCase()}] MercadoPago — cleaningWallets: fallo NO debe reportar éxito falso`, () => {
	// El popup de desvinculación reintenta internamente con un presupuesto de 120s
	// (AppStoreGatewaysPage.openUnlinkPopup, timing Angular ya documentado en el POM) — el
	// timeout default de 60s del test lo corta a mitad de reintento. Mismo ajuste que los
	// specs `no-hold` (test.describe.configure({ timeout: 180_000 })).
	test.describe.configure({ timeout: 180_000 });
	test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });
	test.skip(!CREDS_READY, 'Faltan USER_CARRIER_MP / PASS_CARRIER_MP / BASE_URL (carrier ARG) — configurar .env.test');

	test(
		'@gateway @gateway-pg @mercadopago @carrier [G-05] fallo mockeado (500) de cleaningWallets no debe reportar éxito falso ni desvincular en el FE',
		{ annotation: [{ type: 'tms', description: 'MG-169' }] },
		async ({ page }) => {
			const appStore = new AppStoreGatewaysPage({ page });

			await test.step('Given: carrier ARG logueado con MercadoPago como pasarela activa', async () => {
				await loginAsDispatcher(page, { gateway: 'mercado-pago' });
			});

			await test.step('And: App Store de pasarelas cargado — precondición MercadoPago vinculada', async () => {
				await appStore.goto();
				expect(await appStore.readState('mercado-pago'), 'precondición: MercadoPago debe estar vinculada para este carrier').toBe(
					'linked'
				);
			});

			await test.step('When: se confirma la desvinculación con un 500 mockeado en cleaningWallets — Then: NO debe reportar éxito falso', async () => {
				await appStore.expectUnlinkFailureShowsRealError('mercado-pago');
			});
		}
	);
});
