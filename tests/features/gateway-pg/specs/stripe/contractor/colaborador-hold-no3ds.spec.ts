/**
 * TCs: TS-STRIPE-P2-TC001, TC002, TC003, TC004
 * Feature: Portal Contractor — Alta de Viaje — Colaborador — Hold sin 3DS
 * Tags: @smoke @regression @contractor @hold
 *
 * Precondiciones:
 * - Usuario contractor activo: USER_CONTRACTOR (emanuel.smith@yopmail.com) en TEST.
 * - Colaborador 'smith, Emanuel' debe estar vinculado a la cuenta contractor en TEST.
 * - Preferencias Operativas: Hold activado (TC001, TC003) o desactivado (TC002, TC004).
 * - Evidencia primaria: test-7.spec.ts (mismo flujo con card 4242 sin 3DS).
 *
 * TC001: Hold ON — nueva vinculación de tarjeta + alta
 * TC002: Hold OFF — nueva vinculación de tarjeta + alta
 * TC003: Hold ON — selección de tarjeta existente + alta
 * TC004: Hold OFF — selección de tarjeta existente + alta
 *
 * Nota: TC003/TC004 (selección de tarjeta existente) requieren que el colaborador
 * ya tenga una tarjeta guardada. Sin recording de ese estado, se implementan con
 * el mismo flujo de vinculación nueva hasta disponer de evidencia específica.
 */
import { test } from '../../../../../TestBase';
import { DashboardPage, NewTravelPage, TravelManagementPage } from '../../../../../pages/carrier';
import {
	loginAsContractor,
	expectNoThreeDSModal,
	TEST_DATA,
	STRIPE_TEST_CARDS,
} from '../../../fixtures/gateway.fixtures';

test.use({ role: 'contractor', storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 180_000 });

test.describe('Gateway PG · Contractor · Colaborador — Hold sin 3DS', () => {

	test.describe('Hold ON', () => {

		test('[TS-STRIPE-P2-TC001] @smoke @contractor @hold hold+cobro colaborador sin 3DS', async ({ page }) => {
			const dashboard = new DashboardPage(page);
			const travel = new NewTravelPage(page);
			const management = new TravelManagementPage(page);

			await test.step('Login contractor', async () => {
				await loginAsContractor(page);
			});

			await test.step('Ir al formulario de nuevo viaje', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('Completar formulario — colaborador + tarjeta sin 3DS', async () => {
				await travel.fillMinimum({
					client: TEST_DATA.contractorColaborador,
					passenger: TEST_DATA.contractorColaborador,
					origin: TEST_DATA.origin,
					destination: TEST_DATA.destination,
					// successDirect (4242) no dispara 3DS — confirma hold directo.
					cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4),
				});
			});

			await test.step('Seleccionar vehículo y enviar el viaje', async () => {
				await travel.waitForVehicleSelectionReady();
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			});

			await test.step('Verificar que no aparece modal 3DS', async () => {
				await expectNoThreeDSModal(page);
			});

			await test.step('Esperar redirección al detalle del viaje', async () => {
				await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
			});

			await test.step('Validar viaje en gestión — columna Por asignar', async () => {
				await management.goto();
				await management.expectPassengerInPorAsignar(TEST_DATA.contractorColaborador, TEST_DATA.destination);
			});
		});

		test('[TS-STRIPE-P2-TC003] @regression @contractor @hold selección tarjeta + alta hold+cobro', async ({ page }) => {
			const dashboard = new DashboardPage(page);
			const travel = new NewTravelPage(page);
			const management = new TravelManagementPage(page);

			await test.step('Login contractor', async () => {
				await loginAsContractor(page);
			});

			await test.step('Ir al formulario de nuevo viaje', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('Completar formulario — colaborador + tarjeta sin 3DS (variante)', async () => {
				await travel.fillMinimum({
					client: TEST_DATA.contractorColaborador,
					passenger: TEST_DATA.contractorColaborador,
					origin: TEST_DATA.origin,
					destination: TEST_DATA.destination,
					cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4),
				});
			});

			await test.step('Seleccionar vehículo y enviar el viaje', async () => {
				await travel.waitForVehicleSelectionReady();
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			});

			await test.step('Verificar que no aparece modal 3DS', async () => {
				await expectNoThreeDSModal(page);
			});

			await test.step('Esperar redirección al detalle del viaje', async () => {
				await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
			});

			await test.step('Validar viaje en gestión — columna Por asignar', async () => {
				await management.goto();
				await management.expectPassengerInPorAsignar(TEST_DATA.contractorColaborador, TEST_DATA.destination);
			});
		});

	});

	test.describe('Hold OFF', () => {

		test('[TS-STRIPE-P2-TC002] @regression @contractor sin hold — alta colaborador sin 3DS', async ({ page }) => {
			const dashboard = new DashboardPage(page);
			const travel = new NewTravelPage(page);
			const management = new TravelManagementPage(page);

			await test.step('Login contractor', async () => {
				await loginAsContractor(page);
			});

			await test.step('Ir al formulario de nuevo viaje', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('Completar formulario — colaborador + tarjeta sin 3DS (hold OFF)', async () => {
				await travel.fillMinimum({
					client: TEST_DATA.contractorColaborador,
					passenger: TEST_DATA.contractorColaborador,
					origin: TEST_DATA.origin,
					destination: TEST_DATA.destination,
					cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4),
				});
			});

			await test.step('Seleccionar vehículo y enviar el viaje', async () => {
				await travel.waitForVehicleSelectionReady();
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			});

			await test.step('Verificar que no aparece modal 3DS', async () => {
				await expectNoThreeDSModal(page);
			});

			await test.step('Esperar redirección al detalle del viaje', async () => {
				await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
			});

			await test.step('Validar viaje en gestión — columna Por asignar', async () => {
				await management.goto();
				await management.expectPassengerInPorAsignar(TEST_DATA.contractorColaborador, TEST_DATA.destination);
			});
		});

		test('[TS-STRIPE-P2-TC004] @regression @contractor sin hold — selección tarjeta + alta', async ({ page }) => {
			const dashboard = new DashboardPage(page);
			const travel = new NewTravelPage(page);
			const management = new TravelManagementPage(page);

			await test.step('Login contractor', async () => {
				await loginAsContractor(page);
			});

			await test.step('Ir al formulario de nuevo viaje', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('Completar formulario — colaborador + tarjeta sin 3DS (hold OFF variante)', async () => {
				await travel.fillMinimum({
					client: TEST_DATA.contractorColaborador,
					passenger: TEST_DATA.contractorColaborador,
					origin: TEST_DATA.origin,
					destination: TEST_DATA.destination,
					cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4),
				});
			});

			await test.step('Seleccionar vehículo y enviar el viaje', async () => {
				await travel.waitForVehicleSelectionReady();
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			});

			await test.step('Verificar que no aparece modal 3DS', async () => {
				await expectNoThreeDSModal(page);
			});

			await test.step('Esperar redirección al detalle del viaje', async () => {
				await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
			});

			await test.step('Validar viaje en gestión — columna Por asignar', async () => {
				await management.goto();
				await management.expectPassengerInPorAsignar(TEST_DATA.contractorColaborador, TEST_DATA.destination);
			});
		});

	});

});
