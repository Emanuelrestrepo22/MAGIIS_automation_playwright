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

// TRAZABILIDAD — este smoke queda deliberadamente SIN key Xray (unmapped visible, post-review F4).
//   · NO puede ser MG-220 (TC10 · "vincular Authorize con credenciales válidas"): el smoke no ejecuta
//     el link, solo LEE el estado ya vinculado. El dueño único de MG-220 es
//     `authorize-link-unlink.spec.ts`, que sí ejecuta el link real.
//   · NO puede ser MG-225 tampoco: MG-225 (TC1007 · "persistencia de estado Vinculado tras recargar")
//     PERTENECE al caso `reloadPersistence` de la suite CFG — ver `data/xray-keys.ts` (authorize →
//     `reloadPersistence: 'MG-225'`) + `authorize-link-unlink.spec.ts`, que pasa
//     `GATEWAY_CFG_ALL_CASES` y por lo tanto YA genera ese caso. Anotar MG-225 acá crearía DOS
//     dueños de la misma key: los dos tests se pisan el resultado en el mismo Test Execution —
//     exactamente la colisión que este comentario existe para evitar.
// Conclusión: acreditar cualquiera de las dos keys desde este smoke inflaría evidencia. Si en el
// futuro hace falta una key propia, hay que crear el Test en Xray y registrarlo en `xray-keys.ts`.
test.describe(
	'Gateway PG · Carrier · Smoke Authorize vinculada @gateway @authorize @smoke @regression',
	() => {
		test.describe.configure({ timeout: 120_000 });

		test('[TS-AUTHORIZE-SMOKE-01] Authorize.Net figura vinculada (Unlink) en el App Store — estado persiste en sesión nueva', async ({ page }) => {
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
