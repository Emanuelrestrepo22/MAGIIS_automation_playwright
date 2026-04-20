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

			await test.step('Confirmar creación del viaje via network interception', async () => {
				// Cargo a Bordo post-submit puede quedarse en /travel/create?limitExceeded=false
				// como comportamiento normal del producto. Fuente de verdad: POST /travels interceptado.
				await expect
					.poll(() => travelIdRef?.travelId, {
						timeout: 30_000,
						message: '[TC1096] POST /travels no capturó travelId tras el submit',
					})
					.not.toBeNull();
			});

			await test.step('Validar viaje en gestión - columna Por asignar con estado Buscando chofer', async () => {
				await management.goto();
				await management.expectPassengerInPorAsignar(TEST_DATA.contractorPassenger, undefined, 'Buscando chofer');
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
