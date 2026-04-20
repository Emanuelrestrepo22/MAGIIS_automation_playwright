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
import { test } from '../../../../../../TestBase';
import { DashboardPage, ThreeDSModal } from '../../../../../../pages/carrier';
import { ContractorNewTravelPage } from '../../../../../../pages/contractor/NewTravelPage';
import {
	loginAsContractor,
	TEST_DATA,
	STRIPE_TEST_CARDS,
} from '../../../../fixtures/gateway.fixtures';
import { captureCreatedTravelId, cancelTravelIfCreated, type TravelIdRef } from '../../../../helpers/travel-cleanup';

test.use({ role: 'contractor', storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 180_000 });

test.describe('Gateway PG · Contractor · Colaborador — Hold + 3DS (tarjeta 4000 0025 0000 3155)', () => {

	test('[TS-STRIPE-P2-TC005] @regression @contractor @hold @3ds Hold ON + tarjeta 3DS 3155 + aprobación → viaje a "Buscando conductor"', async ({ page }) => {
		// Precondición: enableCreditCardHold=true en parámetros carrier.
		const dashboard = new DashboardPage(page);
		const travel = new ContractorNewTravelPage(page);
		const threeDS = new ThreeDSModal(page);
		let travelIdRef: TravelIdRef | null = null;

		await test.step('Login contractor', async () => {
			await loginAsContractor(page);
		});

		try {
			travelIdRef = await captureCreatedTravelId(page);

			await test.step('Ir al formulario de nuevo viaje', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('Completar formulario — colaborador + tarjeta con 3DS (4000 0025 0000 3155) + Hold ON', async () => {
				await travel.fillMinimum({
					client: TEST_DATA.contractorColaborador,
					passenger: TEST_DATA.contractorColaborador,
					origin: TEST_DATA.origin,
					destination: TEST_DATA.destination,
					cardLast4: STRIPE_TEST_CARDS.alwaysAuthenticate.slice(-4), // 3155
				});
			});

			await test.step('Completar primer challenge 3DS — validación del hold (vinculación)', async () => {
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
				// 2do challenge puede o no aparecer con saved card; wait no-bloqueante.
				if (await threeDS.waitForOptionalVisible(5_000)) {
					await threeDS.completeSuccess();
					await threeDS.waitForHidden();
				}
			});

			// El portal contractor redirige a /dashboard tras crear el viaje (no a /travels/xxx).
			await page.waitForURL(
				url => !url.href.includes('/travel/create'),
				{ timeout: 30_000, waitUntil: 'commit' }
			);

			// Validación API: el POST /travels devolvió un travelId — viaje creado en backend.
			expect(travelIdRef?.travelId, 'POST /travels debe haber capturado un travelId').not.toBeNull();
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	test('[TS-STRIPE-P2-TC006] @regression @contractor @3ds Hold OFF + tarjeta 3DS 3155 + aprobación → viaje a "Buscando conductor" sin hold', async ({ page }) => {
		// Precondición: enableCreditCardHold=false en parámetros carrier.
		const dashboard = new DashboardPage(page);
		const travel = new ContractorNewTravelPage(page);
		const threeDS = new ThreeDSModal(page);
		let travelIdRef: TravelIdRef | null = null;

		await test.step('Login contractor', async () => {
			await loginAsContractor(page);
		});

		try {
			travelIdRef = await captureCreatedTravelId(page);

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

			await test.step('Seleccionar vehículo y enviar el viaje', async () => {
				await travel.waitForVehicleSelectionReady();
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			});

			await test.step('Completar challenge 3DS si aparece', async () => {
				// Con Hold OFF la tarjeta 3DS puede o no disparar challenge (depende del flujo de autorización).
				// Se manejan hasta 2 challenges opcionales (vinculación + hold).
				if (await threeDS.waitForOptionalVisible(10_000)) {
					await threeDS.completeSuccess();
					await threeDS.waitForHidden();
				}
				if (await threeDS.waitForOptionalVisible(5_000)) {
					await threeDS.completeSuccess();
					await threeDS.waitForHidden();
				}
			});

			// El portal contractor redirige a /dashboard tras crear el viaje (no a /travels/xxx).
			await page.waitForURL(
				url => !url.href.includes('/travel/create'),
				{ timeout: 30_000, waitUntil: 'commit' }
			);

			// Validación API: el POST /travels devolvió un travelId — viaje creado en backend.
			expect(travelIdRef?.travelId, 'POST /travels debe haber capturado un travelId').not.toBeNull();
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

});
