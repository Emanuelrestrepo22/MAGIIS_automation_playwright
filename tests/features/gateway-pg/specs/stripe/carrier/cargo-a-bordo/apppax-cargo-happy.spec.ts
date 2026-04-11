/**
 * TCs: TS-STRIPE-TC1081
 * Feature: Cargo a Bordo — Tarjeta de Crédito — Usuario App Pax — Pago exitoso
 * Tags: @smoke @cargo-a-bordo @web-only
 */
import { expect } from '@playwright/test';
import { test } from '../../../../../../TestBase';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, TravelDetailPage, TravelManagementPage } from '../../../../../../pages/carrier';
import { expectNoThreeDSModal, loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '../../../../fixtures/gateway.fixtures';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

function extractTravelId(url: string): string {
	const match = url.match(/\/travels\/([\w-]+)/);
	if (!match) throw new Error(`No se pudo extraer el travelId desde: ${url}`);
	return match[1];
}

test.describe('Gateway PG · Carrier · App Pax — Cargo a Bordo', () => {

	test('[TS-STRIPE-TC1081] @smoke @cargo-a-bordo pago exitoso sin 3DS', async ({ page }) => {
		const dashboard = new DashboardPage(page);
		const preferences = new OperationalPreferencesPage(page);
		const travel = new NewTravelPage(page);
		const management = new TravelManagementPage(page);
		const detail = new TravelDetailPage(page);

		await test.step('Login carrier', async () => {
			await loginAsDispatcher(page);
		});

		await test.step('Validar hold activo en preferencias operativas', async () => {
			await preferences.goto();
			await preferences.ensureHoldEnabled();
			await preferences.assertHoldEnabled();
		});

		await test.step('Ir al formulario de nuevo viaje', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('Seleccionar servicio cargo y completar formulario', async () => {
			await travel.selectServiceType('cargo');
			await travel.selectClient(TEST_DATA.appPaxPassenger);
			await travel.selectPassenger(TEST_DATA.appPaxPassenger);
			await travel.setOrigin(TEST_DATA.origin);
			await travel.setDestination(TEST_DATA.destination);
			await travel.selectCardByLast4(STRIPE_TEST_CARDS.successDirect.slice(-4));
		});

		await test.step('Seleccionar vehiculo y enviar el viaje', async () => {
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Verificar que no aparece modal 3DS', async () => {
			await expectNoThreeDSModal(page);
		});

		await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
		const createdTravelId = extractTravelId(page.url());

		await test.step('Validar viaje en gestion - columna Por asignar', async () => {
			await management.goto();
			await management.expectPassengerInPorAsignar(TEST_DATA.appPaxPassenger, TEST_DATA.destination);
		});

		await test.step('Abrir detalle del viaje recien creado', async () => {
			await management.openDetailForPassenger(TEST_DATA.appPaxPassenger, TEST_DATA.destination);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
			expect(extractTravelId(page.url())).toBe(createdTravelId);
		});

		await test.step('Validar estado del viaje - Buscando conductor', async () => {
			await detail.expectStatus('Buscando conductor');
		});
	});

});
