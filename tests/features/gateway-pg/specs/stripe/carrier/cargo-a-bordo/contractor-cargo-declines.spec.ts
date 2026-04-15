/**
 * TCs: TS-STRIPE-TC1097–TC1101
 * Feature: Cargo a Bordo — Colaborador/Contractor — Rechazos desde Driver App
 * Tags: @regression @cargo-a-bordo
 *
 * Arquitectura del flujo:
 * - WEB (carrier): cliente contractor + Cargo a Bordo → trip creado → "Buscando conductor" ✅
 * - DRIVER APP (Appium): conductor finaliza viaje e intenta cobrar → tarjeta rechazada
 *
 * Evidencia web: test-13.spec.ts
 */
import type { Page } from '@playwright/test';
import { test } from '../../../../../../TestBase';
import { DashboardPage, NewTravelPage, TravelDetailPage, TravelManagementPage } from '../../../../../../pages/carrier';
import { expectNoThreeDSModal, loginAsDispatcher, TEST_DATA } from '../../../../fixtures/gateway.fixtures';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 120_000 });

async function webPhaseCargoContractor(page: Page): Promise<void> {
	const dashboard = new DashboardPage(page);
	const travel = new NewTravelPage(page);
	const management = new TravelManagementPage(page);
	const detail = new TravelDetailPage(page);

	await test.step('Login carrier', async () => {
		await loginAsDispatcher(page);
	});

	await test.step('Ir al formulario de nuevo viaje', async () => {
		await dashboard.openNewTravel();
		await travel.ensureLoaded();
	});

	await test.step('Completar formulario — cliente contractor + método Cargo a Bordo', async () => {
		await travel.selectClient(TEST_DATA.contractorClient);
		await travel.selectPassenger(TEST_DATA.contractorPassenger);
		await travel.setOrigin(TEST_DATA.origin);
		await travel.setDestination(TEST_DATA.destination);
		await travel.selectPaymentMethod('CargoABordo');
	});

	await test.step('Seleccionar vehículo y enviar el viaje', async () => {
		await travel.clickSelectVehicle();
		await travel.clickSendService();
	});

	await test.step('Verificar que no aparece modal 3DS', async () => {
		await expectNoThreeDSModal(page);
	});

	await test.step('Esperar redirección y validar estado Buscando conductor', async () => {
		await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
		await management.goto();
		await management.expectPassengerInPorAsignar(TEST_DATA.contractorPassenger, TEST_DATA.destination);
		await management.openDetailForPassenger(TEST_DATA.contractorPassenger, TEST_DATA.destination);
		await detail.expectStatus('Buscando conductor');
	});
}

test.describe('Gateway PG · Carrier · Colaborador/Contractor — Cargo a Bordo · Declines', () => {

	test('[TS-STRIPE-TC1097] @regression @cargo-a-bordo pago rechazado genérico desde Driver App', async ({ page }) => {
		await webPhaseCargoContractor(page);
		await test.step('[DRIVER APP] Conductor cobra → tarjeta declinada genéricamente → rechazo', async () => {
			// Tarjeta: STRIPE_TEST_CARDS.declined
			test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium + DriverTripPaymentScreen.');
		});
	});

	test('[TS-STRIPE-TC1098] @regression @cargo-a-bordo fondos insuficientes desde Driver App', async ({ page }) => {
		await webPhaseCargoContractor(page);
		await test.step('[DRIVER APP] Conductor cobra → fondos insuficientes → rechazo', async () => {
			// Tarjeta: STRIPE_TEST_CARDS.insufficientFunds
			test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
		});
	});

	test('[TS-STRIPE-TC1099] @regression @cargo-a-bordo tarjeta perdida desde Driver App', async ({ page }) => {
		await webPhaseCargoContractor(page);
		await test.step('[DRIVER APP] Conductor cobra → tarjeta reportada como perdida → rechazo', async () => {
			// Tarjeta: STRIPE_TEST_CARDS.lostCard
			test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
		});
	});

	test('[TS-STRIPE-TC1100] @regression @cargo-a-bordo CVC incorrecto desde Driver App', async ({ page }) => {
		await webPhaseCargoContractor(page);
		await test.step('[DRIVER APP] Conductor cobra → CVC incorrecto → rechazo', async () => {
			// Tarjeta: STRIPE_TEST_CARDS.incorrectCvc
			test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
		});
	});

	test('[TS-STRIPE-TC1101] @regression @cargo-a-bordo tarjeta robada desde Driver App', async ({ page }) => {
		await webPhaseCargoContractor(page);
		await test.step('[DRIVER APP] Conductor cobra → tarjeta robada → rechazo', async () => {
			// Tarjeta: STRIPE_TEST_CARDS.stolenCard
			test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
		});
	});

});
