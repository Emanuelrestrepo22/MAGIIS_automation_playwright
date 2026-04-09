/**
 * MAGIIS - gateway-pg
 * Suite: Hold y Capture
 * TCs: TC01, TC02
 * Flujo: A - Hold directo
 */

import { test, expect } from '../../../../TestBase';
import { loginAsDispatcher, expectNoThreeDSModal, TEST_DATA, STRIPE_TEST_CARDS } from '../../fixtures/gateway.fixtures';
import { NewTravelPage, OperationalPreferencesPage, TravelDetailPage, TravelManagementPage } from '../../../../pages/carrier';

test.describe.configure({ mode: 'serial' });

test.describe('[gateway][stripe] Hold y Capture - flujo directo', () => {
	test.use({ role: 'carrier', storageState: undefined });

	test.beforeEach(async ({ page }) => {
		await loginAsDispatcher(page);
		const preferences = new OperationalPreferencesPage(page);
		await preferences.goto();
		await preferences.ensureHoldEnabled();
	});

	test.describe('[TC01] Hold exitoso sin 3DS requerido', () => {
		test('El viaje pasa a Buscando conductor inmediatamente tras el hold', async ({ page }) => {
			const travel = new NewTravelPage(page);
			const detail = new TravelDetailPage(page);

			await travel.goto();
			await travel.fillMinimum({
				passenger: TEST_DATA.passenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4)
			});
			await travel.submit();

			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
			await detail.expectStatus('Buscando conductor');
		});

		test('No aparece modal 3DS cuando el hold es directo', async ({ page }) => {
			const travel = new NewTravelPage(page);

			await travel.goto();
			await travel.fillMinimum({
				passenger: TEST_DATA.passenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4)
			});
			await travel.submit();

			await expectNoThreeDSModal(page);
		});

		test('El viaje aparece en la columna Por asignar de gestion de viajes', async ({ page }) => {
			const travel = new NewTravelPage(page);
			const management = new TravelManagementPage(page);

			await travel.goto();
			await travel.fillMinimum({
				passenger: TEST_DATA.passenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4)
			});
			await travel.submit();
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			await management.goto();
			await management.expectPassengerInPorAsignar(TEST_DATA.passenger);
		});
	});

	test.describe('[TC02] Hold declinado - tarjeta rechazada', () => {
		test('Muestra mensaje de error cuando la tarjeta es declinada', async ({ page }) => {
			const travel = new NewTravelPage(page);

			await travel.goto();
			await travel.fillMinimum({
				passenger: TEST_DATA.passenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4: STRIPE_TEST_CARDS.insufficientFunds.slice(-4)
			});
			await travel.submit();

			await expect(page.getByText(/declinada|rechazada|fondos/i)).toBeVisible({ timeout: 10_000 });
		});

		test('El viaje no se crea cuando la tarjeta es declinada', async ({ page }) => {
			const travel = new NewTravelPage(page);

			await travel.goto();
			await travel.fillMinimum({
				passenger: TEST_DATA.passenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4: STRIPE_TEST_CARDS.insufficientFunds.slice(-4)
			});
			await travel.submit();

			await expect(page).not.toHaveURL(/\/travels\/[\w-]+/, { timeout: 5_000 });
		});
	});
});
