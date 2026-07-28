// Smoke Authorize (UI web) — la pasarela Authorize.Net figura VINCULADA en el App Store del carrier 1521.
// Valida: login carrier (creds chain de .env vía loginAsDispatcher — sin hardcode) + App Store carga + estado vinculado.
// i18n-proof: AppStoreGatewaysPage.readState clasifica por clase de color del link (a.red-text = vinculada)
// con fallback al texto "Unlink"/"Desvincular". Authorize NUNCA aplica 3DS → smoke sin challenge.
// Precondición: Authorize ya vinculada en 1521 (hecho por QA). Este smoke NO vincula ni desvincula.
//
// KATA (S1, carrier/gateway-standardization): migrado de raw @playwright/test (URL/user/pass hardcodeados)
// a @TestFixture + loginAsDispatcher({ gateway: 'authorize' }) — cadena de credenciales
// USER_CARRIER_AUTHORIZE_<ENV> → USER_CARRIER_AUTHORIZE → USER_CARRIER_<ENV> → USER_CARRIER.
import { test, expect } from '@TestFixture';
import { AppStoreGatewaysPage } from '@ui/carrier';
import { loginAsDispatcher } from '@features/auth/helpers/login.helpers';

// El fixture KATA no define la opción `role` (login explícito vía loginAsDispatcher).
test.use({ storageState: undefined });

// SIN key Xray (unmapped visible, post-review F4): el smoke solo verifica el estado YA-vinculado — acreditar MG-220 (link con creds válidas) sin ejecutar el flujo de link inflaría evidencia.
test.describe(
	'Gateway PG · Carrier · Smoke Authorize vinculada @gateway @authorize @smoke @regression',
	() => {
		test.describe.configure({ timeout: 120_000 });

		test('[TS-AUTHORIZE-SMOKE-01] Authorize.Net figura vinculada (Unlink) en el App Store', async ({ page }) => {
			const appStore = new AppStoreGatewaysPage({ page });

			await test.step('Given: dispatcher logueado en carrier 1521 (creds chain Authorize)', async () => {
				await loginAsDispatcher(page, { gateway: 'authorize' });
			});

			await test.step('When: navego al App Store (Interfaces de pago)', async () => {
				await appStore.goto();
			});

			await test.step('Then: la card Authorize.Net muestra estado vinculado (Unlink/Desvincular)', async () => {
				await expect(appStore.cardFor('authorize'), 'la card Authorize.Net debe estar visible').toBeVisible({ timeout: 20_000 });
				// Retry-window sobre readState: el App Store renderiza un estado OPTIMISTA que el
				// fetch real corrige (~750ms; más bajo carga — ver root-cause en el POM goto()).
				// Confirmado en vivo 2026-07-27: one-shot leía 'linkable' con la pasarela vinculada
				// (el probe simultáneo veía "Desvincular"). Oráculo MÁS fuerte: exige 'linked'
				// sostenido dentro de la ventana, nunca acepta el frame optimista como veredicto.
				await expect(async () => {
					expect(await appStore.readState('authorize'), 'Authorize debe figurar vinculada (Unlink/Desvincular)').toBe('linked');
				}).toPass({ timeout: 20_000 });
			});
		});
	},
);
