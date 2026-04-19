/**
 * TCs: TS-STRIPE-TC1049, TS-STRIPE-TC1059
 * Feature: Alta de Viaje desde Carrier – Usuario App Pax – Hold y declinación sin 3DS
 * Tags: @smoke @regression @hold @web-only
 *
 * TC1049 – Hold ON exitoso, tarjeta sin 3DS (4242 4242 4242 4242)
 * TC1059 – Hold ON, tarjeta con fondos insuficientes (4000 0000 0000 9995) — viaje no se crea
 */

import { test, expect } from '../../../../TestBase';
import { loginAsDispatcher, expectNoThreeDSModal, TEST_DATA, STRIPE_TEST_CARDS } from '../../fixtures/gateway.fixtures';
import { NewTravelPage, OperationalPreferencesPage, TravelManagementPage } from '../../../../pages/carrier';

test.describe.configure({ mode: 'serial' });
test.describe.configure({ timeout: 120_000 });

test.describe('Gateway PG · Carrier · App Pax — Hold sin 3DS', () => {
	test.use({ role: 'carrier', storageState: undefined });

	test.beforeEach(async ({ page }) => {
		await loginAsDispatcher(page);
		const preferences = new OperationalPreferencesPage(page);
		await preferences.goto();
		await preferences.ensureHoldEnabled();
	});

	test.describe('[TS-STRIPE-TC1049] Hold ON exitoso — tarjeta preautorizada sin 3DS (4242 4242 4242 4242)', () => {
		test('viaje pasa a "Buscando conductor" inmediatamente tras el hold', async ({ page }) => {
			const travel = new NewTravelPage(page);
			const management = new TravelManagementPage(page);

			await travel.goto();
			await travel.fillMinimum({
				passenger: TEST_DATA.passenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4), // 4242
			});
			await travel.submit();

			await management.goto();
			await management.expectPassengerInPorAsignar(TEST_DATA.passenger, TEST_DATA.destination, 'Buscando chofer');
		});

		test('no aparece modal 3DS cuando el hold es directo', async ({ page }) => {
			const travel = new NewTravelPage(page);

			await travel.goto();
			await travel.fillMinimum({
				passenger: TEST_DATA.passenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4), // 4242
			});
			await travel.submit();

			await expectNoThreeDSModal(page);
		});

		test('viaje aparece en columna "Por asignar" de gestión de viajes', async ({ page }) => {
			const travel = new NewTravelPage(page);
			const management = new TravelManagementPage(page);

			await travel.goto();
			await travel.fillMinimum({
				passenger: TEST_DATA.passenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4), // 4242
			});
			await travel.submit();

			await management.goto();
			await management.expectPassengerInPorAsignar(TEST_DATA.passenger);
		});
	});

	test.describe('[TS-STRIPE-TC1059] Hold ON declinado — tarjeta fondos insuficientes (4000 0000 0000 9995), viaje no se crea', () => {
		test('muestra error de declinación cuando la tarjeta tiene fondos insuficientes', async ({ page }) => {
			const travel = new NewTravelPage(page);

			await travel.goto();
			await travel.fillMinimum({
				passenger: TEST_DATA.passenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4: STRIPE_TEST_CARDS.insufficientFunds.slice(-4), // 9995
				skipCardValidation: true, // card 9995 rechaza — controlamos el click Validar
			});

			const result = await travel.clickValidateCardAllowingReject(8_000);
			expect(result.success).toBe(false);
			expect(result.errorMessage ?? '').toMatch(/insufficient funds|fondos insuficientes|declinada|rechazada/i);
		});

		test('el viaje no se crea — URL no redirige a /travels/... cuando la tarjeta es declinada', async ({ page }) => {
			const travel = new NewTravelPage(page);

			await travel.goto();
			await travel.fillMinimum({
				passenger: TEST_DATA.passenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4: STRIPE_TEST_CARDS.insufficientFunds.slice(-4), // 9995
				skipCardValidation: true,
			});

			// La card 9995 rechaza en el paso de validación — nunca se llega a submit.
			const result = await travel.clickValidateCardAllowingReject(8_000);
			expect(result.success).toBe(false);
			await expect(page).not.toHaveURL(/\/travels\/[\w-]+/, { timeout: 5_000 });
		});
	});
});
