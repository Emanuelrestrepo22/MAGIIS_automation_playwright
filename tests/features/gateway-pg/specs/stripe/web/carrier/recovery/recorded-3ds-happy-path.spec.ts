/**
 * TCs: TS-STRIPE-TC1053
 * Feature: Carrier · App Pax · Hold ON · Alta de viaje con tarjeta success3DS (4000 0025 0000 3155) — modal 3DS aprobado, viaje activo
 * Tags: @smoke @3ds @hold @web-only
 *
 * Observaciones del flujo real (entorno TEST):
 *   - El portal puede tener sesión activa → login explícito + ensureDashboardLoaded validan el shell
 *   - El formulario pre-carga dirección "home" del pasajero como origen → setOrigin() la limpia con X
 *
 * KATA conformance (feature/kata-conformance):
 *   - test/expect vienen del fixture unificado KATA (@TestFixture); login vía loginAsDispatcher(page)
 *     (el fixture KATA no expone `credentials`/`role`); sustrato carrier vía componentes @ui/carrier
 *     y modal 3DS vía @ui/ThreeDsChallengePage.
 *   @atc idmap (mapeo por área): challenge 3DS success → área D (MG-152); hold → área E (MG-158).
 */

import { test, expect } from '@TestFixture';
import { CarrierDashboardPage, CarrierNewTravelPage, CarrierOperationalPreferencesPage } from '@ui/carrier';
import { ThreeDsChallengePage } from '@ui/ThreeDsChallengePage';
import { loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';

test.use({ storageState: undefined });

test.describe('[TS-STRIPE-TC1053] Hold ON + success3DS (4000 0025 0000 3155) — modal 3DS se presenta, pasajero aprueba, viaje pasa a "Buscando conductor" @gateway @stripe @hold @3ds @critical', () => {
	test('crear viaje con tarjeta 3DS, aprobar autenticación y validar viaje activo', async ({ page }) => {
		test.setTimeout(90_000);

		const dashboardPage = new CarrierDashboardPage({ page });
		const preferences   = new CarrierOperationalPreferencesPage({ page });
		const travelPage    = new CarrierNewTravelPage({ page });

		await test.step('Login carrier', async () => {
			await loginAsDispatcher(page);
			await dashboardPage.ensureDashboardLoaded();
		});

		await test.step('Validar hold activo en preferencias operativas', async () => {
			await preferences.goto();
			await preferences.ensureHoldEnabled();
			await preferences.assertHoldEnabled();
		});

		await test.step('Abrir formulario de nuevo viaje', async () => {
			await dashboardPage.openNewTravel();
			await travelPage.ensureLoaded();
		});

		await test.step('Completar formulario con pasajero app pax y tarjeta success3DS (4000 0025 0000 3155)', async () => {
			await travelPage.fillMinimum({
				passenger:   TEST_DATA.passenger,
				origin:      TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4:   STRIPE_TEST_CARDS.alwaysAuthenticate.slice(-4), // 4000002760003184 (always 3DS)
			});
		});

		await test.step('Enviar viaje — sistema ejecuta hold Stripe y presenta modal 3DS', async () => {
			await travelPage.submit();
		});

		await test.step('Aprobar autenticación en modal 3DS de Stripe', async () => {
			const threeDS = new ThreeDsChallengePage({ page });
			await threeDS.waitForVisible();
			await threeDS.completeSuccess();
			await threeDS.waitForHidden();
		});

		await test.step('Seleccionar vehículo y enviar el servicio', async () => {
			await travelPage.clickSelectVehicle();
			await travelPage.clickSendService();
		});

		await test.step('Validar redirección al formulario de nuevo viaje — flujo completado', async () => {
			await expect(page).toHaveURL(/\/home\/carrier\/travel\/create/, { timeout: 15_000 });
		});
	});
});
