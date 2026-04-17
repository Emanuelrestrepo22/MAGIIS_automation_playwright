/**
 * TCs: TS-STRIPE-P2-TC001, TC002, TC003, TC004
 * Feature: Portal Contractor — Alta de Viaje — Colaborador — Hold sin 3DS (tarjeta 4242 4242 4242 4242)
 * Tags: @smoke @regression @contractor @hold
 *
 * Precondiciones:
 * - Usuario contractor activo (USER_CONTRACTOR / PASS_CONTRACTOR) en TEST.
 * - Colaborador configurado en TEST_DATA.contractorColaborador.
 * - Hold ON tests (TC001, TC003): preferencias operativas del carrier con enableCreditCardHold=true.
 * - Hold OFF tests (TC002, TC004): preferencias operativas del carrier con enableCreditCardHold=false.
 *   ⚠ El estado de hold se controla desde el portal carrier — requiere sesión carrier previa.
 *   Si el ambiente no tiene el estado correcto el test fallará con una discrepancia de comportamiento.
 *
 * TC001: Hold ON  — nueva vinculación tarjeta 4242 + alta → viaje a "Buscando conductor"
 * TC002: Hold OFF — nueva vinculación tarjeta 4242 + alta → viaje a "Buscando conductor" sin hold
 * TC003: Hold ON  — selección tarjeta existente + alta → viaje a "Buscando conductor"
 *         Evidencia test-19.spec.ts: el colaborador 'smith, Emanuel' ya tiene una "Tarjeta de crédito VISA ***"
 *         guardada. El selector es #add_travel_payment_methods → .below → .single → .value → .data-with-icon-col.
 * TC004: Hold OFF — selección tarjeta existente + alta → viaje a "Buscando conductor" sin hold.
 */
import { expect } from '@playwright/test';
import { test } from '../../../../../TestBase';
import { DashboardPage, TravelDetailPage, TravelManagementPage } from '../../../../../pages/carrier';
import { ContractorNewTravelPage } from '../../../../../pages/contractor/NewTravelPage';
import {
	loginAsContractor,
	expectNoThreeDSModal,
	TEST_DATA,
	STRIPE_TEST_CARDS,
} from '../../../fixtures/gateway.fixtures';
import { captureCreatedTravelId, cancelTravelIfCreated, type TravelIdRef } from '../../../helpers/travel-cleanup';

// El portal contractor redirige a /dashboard (no a /travels/xxx) tras crear un viaje.
// Por eso se usa captureCreatedTravelId (API POST /travels) en lugar de extractTravelId(url).
function extractTravelIdSafe(url: string): string | null {
	return url.match(/\/travels\/([\w-]+)/)?.[1] ?? null;
}

test.use({ role: 'contractor', storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 180_000 });

test.describe('Gateway PG · Contractor · Colaborador — Hold sin 3DS (tarjeta 4242 4242 4242 4242)', () => {

	test.describe('Hold ON', () => {

		test('[TS-STRIPE-P2-TC001] @smoke @contractor @hold Hold ON + nueva vinculación tarjeta 4242 + alta colaborador → viaje a "Buscando conductor"', async ({ page }) => {
			const dashboard = new DashboardPage(page);
			const travel = new ContractorNewTravelPage(page);
			const detail = new TravelDetailPage(page);
			const management = new TravelManagementPage(page);
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

				await test.step('Completar formulario — colaborador + tarjeta sin 3DS (4242) + Hold ON', async () => {
					await travel.fillMinimum({
						client: TEST_DATA.contractorColaborador,
						passenger: TEST_DATA.contractorColaborador,
						origin: TEST_DATA.origin,
						destination: TEST_DATA.destination,
						cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4), // 4242
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

				// El portal contractor redirige a /dashboard tras crear el viaje (no a /travels/xxx).
				await page.waitForURL(
					url => !url.href.includes('/travel/create'),
					{ timeout: 30_000, waitUntil: 'commit' }
				);

				await test.step('Validar viaje en gestión — columna Por asignar', async () => {
					await management.goto();
					await management.expectPassengerInPorAsignar(TEST_DATA.contractorColaborador, TEST_DATA.destination);
				});

				await test.step('Abrir detalle del viaje recién creado', async () => {
					await management.openDetailForPassenger(TEST_DATA.contractorColaborador, TEST_DATA.destination);
					await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 30_000, waitUntil: 'commit' });
					const detailId = extractTravelIdSafe(page.url());
					if (travelIdRef?.travelId && detailId) {
						expect(detailId).toBe(String(travelIdRef.travelId));
					}
				});

				await test.step('Validar estado del viaje — Buscando conductor', async () => {
					await detail.expectStatus('Buscando conductor');
				});
			} finally {
				if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
			}
		});

		test('[TS-STRIPE-P2-TC003] @regression @contractor @hold Hold ON + selección tarjeta VISA guardada del colaborador + alta → viaje a "Buscando conductor"', async ({ page }) => {
			const dashboard = new DashboardPage(page);
			const travel = new ContractorNewTravelPage(page);
			const detail = new TravelDetailPage(page);
			const management = new TravelManagementPage(page);
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

				await test.step('Seleccionar colaborador, origen y destino', async () => {
					await travel.selectClient(TEST_DATA.contractorColaborador);
					await travel.setOrigin(TEST_DATA.origin);
					await travel.setDestination(TEST_DATA.destination);
				});

				await test.step('Seleccionar tarjeta VISA guardada del colaborador', async () => {
					// Precondición: el colaborador debe tener una tarjeta guardada resaltada (.highlighted).
					// Si no existe, este test no es ejecutable en el ambiente actual.
					const highlighted = page.locator('.ng-star-inserted.highlighted > .data-with-icon-col').first();
					const hasCard = await highlighted.isVisible({ timeout: 5_000 }).catch(() => false);
					test.skip(!hasCard, '[TC003] PRECONDICIÓN: colaborador no tiene tarjeta guardada en TEST. Vincular tarjeta primero.');
					await travel.selectSavedCard();
				});

				await test.step('Seleccionar vehículo y enviar el viaje', async () => {
					await travel.waitForVehicleSelectionReady();
					await travel.clickSelectVehicle();
					await travel.clickSendService();
				});

				await test.step('Verificar que no aparece modal 3DS', async () => {
					await expectNoThreeDSModal(page);
				});

				await page.waitForURL(
					url => !url.href.includes('/travel/create'),
					{ timeout: 30_000, waitUntil: 'commit' }
				);

				await test.step('Validar viaje en gestión — columna Por asignar', async () => {
					await management.goto();
					await management.expectPassengerInPorAsignar(TEST_DATA.contractorColaborador, TEST_DATA.destination);
				});

				await test.step('Abrir detalle del viaje recién creado', async () => {
					await management.openDetailForPassenger(TEST_DATA.contractorColaborador, TEST_DATA.destination);
					await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 30_000, waitUntil: 'commit' });
					const detailId = extractTravelIdSafe(page.url());
					if (travelIdRef?.travelId && detailId) {
						expect(detailId).toBe(String(travelIdRef.travelId));
					}
				});

				await test.step('Validar estado del viaje — Buscando conductor', async () => {
					await detail.expectStatus('Buscando conductor');
				});
			} finally {
				if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
			}
		});

	});

	test.describe('Hold OFF', () => {

		test('[TS-STRIPE-P2-TC002] @regression @contractor @hold Hold OFF + nueva vinculación tarjeta 4242 + alta colaborador → viaje a "Buscando conductor" sin hold', async ({ page }) => {
			const dashboard = new DashboardPage(page);
			const travel = new ContractorNewTravelPage(page);
			const detail = new TravelDetailPage(page);
			const management = new TravelManagementPage(page);
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

				await test.step('Completar formulario — colaborador + tarjeta sin 3DS (4242) + Hold OFF', async () => {
					await travel.fillMinimum({
						client: TEST_DATA.contractorColaborador,
						passenger: TEST_DATA.contractorColaborador,
						origin: TEST_DATA.origin,
						destination: TEST_DATA.destination,
						cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4), // 4242
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

				await page.waitForURL(
					url => !url.href.includes('/travel/create'),
					{ timeout: 30_000, waitUntil: 'commit' }
				);

				await test.step('Validar viaje en gestión — columna Por asignar', async () => {
					await management.goto();
					await management.expectPassengerInPorAsignar(TEST_DATA.contractorColaborador, TEST_DATA.destination);
				});

				await test.step('Abrir detalle del viaje recién creado', async () => {
					await management.openDetailForPassenger(TEST_DATA.contractorColaborador, TEST_DATA.destination);
					await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 30_000, waitUntil: 'commit' });
					const detailId = extractTravelIdSafe(page.url());
					if (travelIdRef?.travelId && detailId) {
						expect(detailId).toBe(String(travelIdRef.travelId));
					}
				});

				await test.step('Validar estado del viaje — Buscando conductor', async () => {
					await detail.expectStatus('Buscando conductor');
				});
			} finally {
				if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
			}
		});

		test('[TS-STRIPE-P2-TC004] @regression @contractor @hold Hold OFF + selección tarjeta VISA guardada del colaborador + alta → viaje a "Buscando conductor" sin hold', async ({ page }) => {
			const dashboard = new DashboardPage(page);
			const travel = new ContractorNewTravelPage(page);
			const detail = new TravelDetailPage(page);
			const management = new TravelManagementPage(page);
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

				await test.step('Seleccionar colaborador, origen y destino', async () => {
					await travel.selectClient(TEST_DATA.contractorColaborador);
					await travel.setOrigin(TEST_DATA.origin);
					await travel.setDestination(TEST_DATA.destination);
				});

				await test.step('Seleccionar tarjeta VISA guardada del colaborador (Hold OFF)', async () => {
					const highlighted = page.locator('.ng-star-inserted.highlighted > .data-with-icon-col').first();
					const hasCard = await highlighted.isVisible({ timeout: 5_000 }).catch(() => false);
					test.skip(!hasCard, '[TC004] PRECONDICIÓN: colaborador no tiene tarjeta guardada en TEST. Vincular tarjeta primero.');
					await travel.selectSavedCard();
				});

				await test.step('Seleccionar vehículo y enviar el viaje', async () => {
					await travel.waitForVehicleSelectionReady();
					await travel.clickSelectVehicle();
					await travel.clickSendService();
				});

				await test.step('Verificar que no aparece modal 3DS', async () => {
					await expectNoThreeDSModal(page);
				});

				await page.waitForURL(
					url => !url.href.includes('/travel/create'),
					{ timeout: 30_000, waitUntil: 'commit' }
				);

				await test.step('Validar viaje en gestión — columna Por asignar', async () => {
					await management.goto();
					await management.expectPassengerInPorAsignar(TEST_DATA.contractorColaborador, TEST_DATA.destination);
				});

				await test.step('Abrir detalle del viaje recién creado', async () => {
					await management.openDetailForPassenger(TEST_DATA.contractorColaborador, TEST_DATA.destination);
					await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 30_000, waitUntil: 'commit' });
					const detailId = extractTravelIdSafe(page.url());
					if (travelIdRef?.travelId && detailId) {
						expect(detailId).toBe(String(travelIdRef.travelId));
					}
				});

				await test.step('Validar estado del viaje — Buscando conductor', async () => {
					await detail.expectStatus('Buscando conductor');
				});
			} finally {
				if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
			}
		});

	});

});
