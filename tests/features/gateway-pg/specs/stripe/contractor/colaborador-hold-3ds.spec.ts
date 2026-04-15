/**
 * TCs: TS-STRIPE-P2-TC005, TS-STRIPE-P2-TC006
 * Feature: Portal Contractor — Alta de Viaje — Colaborador — Hold + 3DS
 * Tags: @regression @contractor @hold @3ds
 *
 * Precondiciones:
 * - Usuario contractor activo: USER_CONTRACTOR (emanuel.smith@yopmail.com) en TEST.
 * - Colaborador 'smith, Emanuel' debe estar vinculado a la cuenta contractor en TEST.
 * - Preferencias Operativas: Cobros con Tarjeta → Hold activado, 3DS habilitado.
 * - Evidencia primaria: test-7.spec.ts
 *
 * Flujo confirmado por test-7:
 * - Login contractor → Nuevo Viaje → seleccionar colaborador ('ema' → 'smith, Emanuel')
 * - Origin/Destination → pago Preautorizada → Stripe form → Validar → 3DS challenge (Complete)
 * - Seleccionar Vehículo → Enviar Servicio → 3DS challenge final (Complete)
 */
import { test } from '../../../../../TestBase';
import { DashboardPage, NewTravelPage, TravelManagementPage } from '../../../../../pages/carrier';
import {
	loginAsContractor,
	TEST_DATA,
	STRIPE_TEST_CARDS,
} from '../../../fixtures/gateway.fixtures';
import { ThreeDSModal } from '../../../../../pages/carrier';

test.use({ role: 'contractor', storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 180_000 });

test.describe('Gateway PG · Contractor · Colaborador — Hold + 3DS', () => {

	test('[TS-STRIPE-P2-TC005] @regression @contractor @hold @3ds hold+cobro colaborador con 3DS', async ({ page }) => {
		const dashboard = new DashboardPage(page);
		const travel = new NewTravelPage(page);
		const management = new TravelManagementPage(page);
		const threeDS = new ThreeDSModal(page);

		await test.step('Login contractor', async () => {
			await loginAsContractor(page);
		});

		await test.step('Ir al formulario de nuevo viaje', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('Completar formulario — colaborador + tarjeta con 3DS', async () => {
			// En el portal contractor el colaborador actúa como cliente.
			// Evidencia test-7: buscar 'ema' → seleccionar 'smith, Emanuel'.
			await travel.fillMinimum({
				client: TEST_DATA.contractorColaborador,
				passenger: TEST_DATA.contractorColaborador,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				// Evidencia test-7: card alwaysAuthenticate (3184) dispara 3DS en TEST.
				cardLast4: STRIPE_TEST_CARDS.alwaysAuthenticate.slice(-4),
			});
		});

		await test.step('Completar primer challenge 3DS — validación del hold', async () => {
			// test-7: primer challenge aparece después de clickValidateCard (ya incluido en fillMinimum).
			await threeDS.completeSuccess();
		});

		await test.step('Seleccionar vehículo y enviar el viaje', async () => {
			await travel.waitForVehicleSelectionReady();
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Completar segundo challenge 3DS — confirmación del servicio', async () => {
			// test-7: segundo challenge aparece al enviar el servicio.
			await threeDS.completeSuccess();
		});

		await test.step('Esperar redirección al detalle del viaje', async () => {
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
		});

		await test.step('Validar viaje en gestión — columna Por asignar', async () => {
			await management.goto();
			await management.expectPassengerInPorAsignar(TEST_DATA.contractorColaborador, TEST_DATA.destination);
		});
	});

	test('[TS-STRIPE-P2-TC006] @regression @contractor @3ds sin hold — alta colaborador con 3DS', async ({ page }) => {
		const dashboard = new DashboardPage(page);
		const travel = new NewTravelPage(page);
		const threeDS = new ThreeDSModal(page);

		await test.step('Login contractor', async () => {
			await loginAsContractor(page);
		});

		await test.step('Ir al formulario de nuevo viaje', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('Completar formulario — colaborador + tarjeta con 3DS (hold OFF)', async () => {
			await travel.fillMinimum({
				client: TEST_DATA.contractorColaborador,
				passenger: TEST_DATA.contractorColaborador,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4: STRIPE_TEST_CARDS.alwaysAuthenticate.slice(-4),
			});
		});

		await test.step('Completar challenge 3DS', async () => {
			await threeDS.completeSuccess();
		});

		await test.step('Seleccionar vehículo y enviar el viaje', async () => {
			await travel.waitForVehicleSelectionReady();
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Esperar redirección al detalle del viaje', async () => {
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
		});
	});

});
