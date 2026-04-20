/**
 * TCs: TS-STRIPE-TC1096
 * Feature: Cargo a Bordo — Tarjeta de Crédito — Usuario Colaborador/Contractor — Pago exitoso
 * Tags: @smoke @cargo-a-bordo @web-only
 */
import { expect } from '@playwright/test';
import { test } from '../../../../../../../TestBase';
import { DashboardPage, NewTravelPage, TravelDetailPage, TravelManagementPage } from '../../../../../../../pages/carrier';
import { expectNoThreeDSModal, loginAsDispatcher, TEST_DATA } from '../../../../../fixtures/gateway.fixtures';
import { captureCreatedTravelId, cancelTravelIfCreated, type TravelIdRef } from '../../../../../helpers/travel-cleanup';

// Evidencia: test-13.spec.ts
// Flujo: carrier web crea viaje con cliente contractor y método "Tarjeta de Crédito - Cargo a Bordo".
// No hay formulario Stripe ni 3DS desde carrier. El cobro ocurre en Driver App al finalizar.

test.use({ role: 'carrier', storageState: undefined });
test.describe.configure({ timeout: 120_000 });

test.describe('Gateway PG · Carrier · Colaborador/Contractor — Cargo a Bordo', () => {

	test('[TS-STRIPE-TC1096] @smoke @cargo-a-bordo pago exitoso sin 3DS', async ({ page }) => {
		const dashboard = new DashboardPage(page);
		const travel = new NewTravelPage(page);
		const management = new TravelManagementPage(page);
		const detail = new TravelDetailPage(page);
		let travelIdRef: TravelIdRef | null = null;

		await test.step('Login carrier', async () => {
			await loginAsDispatcher(page);
		});

		try {
			travelIdRef = await captureCreatedTravelId(page);

			await test.step('Ir al formulario de nuevo viaje', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('Completar formulario con cliente contractor y método Cargo a Bordo', async () => {
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

			await test.step('Esperar creación del viaje', async () => {
				const result = await Promise.race([
					page.waitForURL(/\/travels\/[\w-]+$/, { timeout: 30_000, waitUntil: 'commit' }).then(() => 'success' as const),
					page.waitForURL(/limitExceeded/, { timeout: 30_000, waitUntil: 'commit' }).then(() => 'limitExceeded' as const),
				]).catch(() => 'timeout' as const);

				if (result === 'limitExceeded') {
					throw new Error(
						'[TC1096] PRECONDICIÓN NO CUMPLIDA: limitExceeded=false. ' +
						'Verificar tarjeta Cargo a Bordo del pasajero contractor (smith, Emanuel) en TEST.',
					);
				}
				if (result === 'timeout') {
					throw new Error('[TC1096] TIMEOUT: URL no redirigió al detalle del viaje ni a limitExceeded.');
				}
			});

			expect(travelIdRef?.travelId, 'POST /travels debe haber capturado travelId').not.toBeNull();

			await test.step('Validar viaje en gestión - columna Por asignar', async () => {
				await management.goto();
				await management.expectPassengerInPorAsignar(TEST_DATA.contractorPassenger, TEST_DATA.destination);
			});

			await test.step('Abrir detalle del viaje recién creado', async () => {
				await management.openDetailForPassenger(TEST_DATA.contractorPassenger, TEST_DATA.destination);
				await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 30_000, waitUntil: 'commit' });
			});

			await test.step('Validar estado del viaje - Buscando conductor', async () => {
				await detail.expectStatus('Buscando conductor');
			});
		} finally {
			if (travelIdRef) {
				await test.step('Cleanup: cancelar viaje creado', async () => {
					await cancelTravelIfCreated(page, travelIdRef!);
				});
			}
		}
	});

});
