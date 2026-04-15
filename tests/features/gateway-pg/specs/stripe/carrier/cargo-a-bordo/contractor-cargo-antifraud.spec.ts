/**
 * TCs: TS-STRIPE-TC1102–TC1106
 * Feature: Cargo a Bordo — Colaborador/Contractor — Antifraud desde Driver App
 * Tags: @regression @cargo-a-bordo
 *
 * Arquitectura del flujo:
 * - WEB (carrier): cliente contractor + Cargo a Bordo → trip creado → "Buscando conductor" ✅
 * - DRIVER APP (Appium): conductor finaliza viaje e intenta cobrar → tarjeta dispara regla antifraud
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

test.describe('Gateway PG · Carrier · Colaborador/Contractor — Cargo a Bordo · Antifraud', () => {

	test('[TS-STRIPE-TC1102] @regression @cargo-a-bordo tarjeta alto riesgo desde Driver App', async ({ page }) => {
		await webPhaseCargoContractor(page);
		await test.step('[DRIVER APP] Conductor cobra → tarjeta de alto riesgo → bloqueado', async () => {
			// Tarjeta: STRIPE_TEST_CARDS.cvcCheckFail (4000 0000 0000 0101) — Excel TC1102
			test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium + DriverTripPaymentScreen.');
		});
	});

	test('[TS-STRIPE-TC1103] @regression @cargo-a-bordo tarjeta siempre bloqueada desde Driver App', async ({ page }) => {
		await webPhaseCargoContractor(page);
		await test.step('[DRIVER APP] Conductor cobra → always_blocked → bloqueado por antifraud', async () => {
			// Tarjeta: STRIPE_TEST_CARDS.highestRisk (4100 0000 0000 0019) — Excel TC1103
			test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
		});
	});

	test('[TS-STRIPE-TC1104] @regression @cargo-a-bordo CVC check fail elevated desde Driver App', async ({ page }) => {
		await webPhaseCargoContractor(page);
		await test.step('[DRIVER APP] Conductor cobra → CVC check fail elevado → bloqueado', async () => {
			// Tarjeta: STRIPE_TEST_CARDS.cvcCheckFailElevated (4000 0000 0000 4954) — Excel TC1104
			test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
		});
	});

	test('[TS-STRIPE-TC1105] @regression @cargo-a-bordo ZIP fail elevated desde Driver App', async ({ page }) => {
		await webPhaseCargoContractor(page);
		await test.step('[DRIVER APP] Conductor cobra → ZIP fail elevado → bloqueado por antifraud', async () => {
			// Tarjeta: STRIPE_TEST_CARDS.zipFailElevated
			test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
		});
	});

	test('[TS-STRIPE-TC1106] @regression @cargo-a-bordo address unavailable desde Driver App', async ({ page }) => {
		await webPhaseCargoContractor(page);
		await test.step('[DRIVER APP] Conductor cobra → dirección no disponible → bloqueado por antifraud', async () => {
			// Tarjeta: STRIPE_TEST_CARDS.addressUnavailable
			test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
		});
	});

});
