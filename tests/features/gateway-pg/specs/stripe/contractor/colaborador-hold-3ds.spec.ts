/**
 * TCs: TS-STRIPE-P2-TC005, TS-STRIPE-P2-TC006
 * Feature: Portal Contractor — Alta de Viaje — Colaborador — Hold + 3DS (tarjeta 4000 0025 0000 3155)
 * Tags: @regression @contractor @hold @3ds
 *
 * Precondiciones:
 * - Usuario contractor activo (USER_CONTRACTOR / PASS_CONTRACTOR) en TEST.
 * - Colaborador configurado en TEST_DATA.contractorColaborador.
 * - TC005 (Hold ON + 3DS): enableCreditCardHold=true en parámetros del carrier.
 * - TC006 (Hold OFF + 3DS): enableCreditCardHold=false en parámetros del carrier.
 *   ⚠ El estado de hold se controla desde el portal carrier (Preferencias Operativas).
 *
 * Flujo confirmado por test-7 (evidencia):
 *   Login contractor → Nuevo Viaje → seleccionar colaborador → Origin/Destination
 *   → pago Preautorizada → Stripe form → Validar → 1er challenge 3DS (Complete)
 *   → Seleccionar Vehículo → Enviar Servicio → 2do challenge 3DS (Complete)
 *
 * TC005: Hold ON  — tarjeta 4000 0025 0000 3155 + 3DS aprobado → viaje a "Buscando conductor"
 * TC006: Hold OFF — tarjeta 4000 0025 0000 3155 + 3DS aprobado → viaje a "Buscando conductor" sin hold
 */
import { expect } from '@playwright/test';
import { test } from '../../../../../TestBase';
import { DashboardPage, NewTravelPage, TravelDetailPage, TravelManagementPage, ThreeDSModal } from '../../../../../pages/carrier';
import {
	loginAsContractor,
	TEST_DATA,
	STRIPE_TEST_CARDS,
} from '../../../fixtures/gateway.fixtures';

function extractTravelId(url: string): string {
	const match = url.match(/\/travels\/([\w-]+)/);
	if (!match) throw new Error(`No se pudo extraer el travelId desde: ${url}`);
	return match[1];
}

test.use({ role: 'contractor', storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 180_000 });

test.describe('Gateway PG · Contractor · Colaborador — Hold + 3DS (tarjeta 4000 0025 0000 3155)', () => {

	test('[TS-STRIPE-P2-TC005] @regression @contractor @hold @3ds Hold ON + tarjeta 3DS 3155 + aprobación → viaje a "Buscando conductor"', async ({ page }) => {
		// Precondición: enableCreditCardHold=true en parámetros carrier.
		const dashboard = new DashboardPage(page);
		const travel = new NewTravelPage(page);
		const detail = new TravelDetailPage(page);
		const management = new TravelManagementPage(page);
		const threeDS = new ThreeDSModal(page);

		await test.step('Login contractor', async () => {
			await loginAsContractor(page);
		});

		await test.step('Ir al formulario de nuevo viaje', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('Completar formulario — colaborador + tarjeta con 3DS (4000 0025 0000 3155) + Hold ON', async () => {
			// Evidencia test-7: alwaysAuthenticate (3155) dispara 3DS en el step de vinculación.
			await travel.fillMinimum({
				client: TEST_DATA.contractorColaborador,
				passenger: TEST_DATA.contractorColaborador,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4: STRIPE_TEST_CARDS.alwaysAuthenticate.slice(-4), // 3155
			});
		});

		await test.step('Completar primer challenge 3DS — validación del hold (vinculación)', async () => {
			// Evidencia test-7: 1er challenge aparece tras el paso de vinculación/validación de tarjeta.
			// Debería desaparecer el modal 3DS tras aprobar.
			await threeDS.waitForVisible();
			await threeDS.completeSuccess();
			await threeDS.waitForHidden();
		});

		await test.step('Seleccionar vehículo y enviar el viaje', async () => {
			await travel.waitForVehicleSelectionReady();
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Completar segundo challenge 3DS — confirmación del servicio', async () => {
			// Evidencia test-7: 2do challenge aparece al enviar el servicio.
			await threeDS.waitForVisible();
			await threeDS.completeSuccess();
			await threeDS.waitForHidden();
		});

		await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
		const createdTravelId = extractTravelId(page.url());

		await test.step('Validar viaje en gestión — columna Por asignar', async () => {
			await management.goto();
			await management.expectPassengerInPorAsignar(TEST_DATA.contractorColaborador, TEST_DATA.destination);
		});

		await test.step('Abrir detalle del viaje recién creado', async () => {
			await management.openDetailForPassenger(TEST_DATA.contractorColaborador, TEST_DATA.destination);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
			// Debería abrir el mismo viaje creado, no otro.
			expect(extractTravelId(page.url())).toBe(createdTravelId);
		});

		await test.step('Validar estado del viaje — Buscando conductor', async () => {
			// Debería mostrar "Buscando conductor" tras hold y 3DS exitosos.
			await detail.expectStatus('Buscando conductor');
		});
	});

	test('[TS-STRIPE-P2-TC006] @regression @contractor @3ds Hold OFF + tarjeta 3DS 3155 + aprobación → viaje a "Buscando conductor" sin hold', async ({ page }) => {
		// Precondición: enableCreditCardHold=false en parámetros carrier.
		const dashboard = new DashboardPage(page);
		const travel = new NewTravelPage(page);
		const detail = new TravelDetailPage(page);
		const management = new TravelManagementPage(page);
		const threeDS = new ThreeDSModal(page);

		await test.step('Login contractor', async () => {
			await loginAsContractor(page);
		});

		await test.step('Ir al formulario de nuevo viaje', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('Completar formulario — colaborador + tarjeta con 3DS (4000 0025 0000 3155) + Hold OFF', async () => {
			await travel.fillMinimum({
				client: TEST_DATA.contractorColaborador,
				passenger: TEST_DATA.contractorColaborador,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4: STRIPE_TEST_CARDS.alwaysAuthenticate.slice(-4), // 3155
			});
		});

		await test.step('Completar challenge 3DS', async () => {
			// Con hold OFF puede haber 1 o 2 challenges dependiendo del ambiente.
			// Se espera al menos 1 challenge de vinculación de tarjeta.
			await threeDS.waitForVisible();
			await threeDS.completeSuccess();
			await threeDS.waitForHidden();
		});

		await test.step('Seleccionar vehículo y enviar el viaje', async () => {
			await travel.waitForVehicleSelectionReady();
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
		const createdTravelId = extractTravelId(page.url());

		await test.step('Validar viaje en gestión — columna Por asignar', async () => {
			// Sin hold el viaje también debe aparecer en "Por asignar".
			await management.goto();
			await management.expectPassengerInPorAsignar(TEST_DATA.contractorColaborador, TEST_DATA.destination);
		});

		await test.step('Abrir detalle del viaje recién creado', async () => {
			await management.openDetailForPassenger(TEST_DATA.contractorColaborador, TEST_DATA.destination);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
			expect(extractTravelId(page.url())).toBe(createdTravelId);
		});

		await test.step('Validar estado del viaje — Buscando conductor', async () => {
			// Sin hold el viaje pasa directamente a "Buscando conductor".
			await detail.expectStatus('Buscando conductor');
		});
	});

});
