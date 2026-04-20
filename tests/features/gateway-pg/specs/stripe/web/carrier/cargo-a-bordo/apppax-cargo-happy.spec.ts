/**
 * TCs: TS-STRIPE-TC1081
 * Feature: Cargo a Bordo — Tarjeta de Crédito — Usuario App Pax — Pago exitoso
 * Tags: @smoke @cargo-a-bordo @web-only
 *
 * Notas de comportamiento:
 * - Cargo a Bordo NO usa tarjeta ni formulario Stripe en carrier. El cobro y validación
 *   de tarjeta ocurren exclusivamente en la Driver App al finalizar el viaje.
 * - Post-submit el producto puede quedarse en /travel/create?limitExceeded=false como
 *   comportamiento normal (no es un error). Validar creación vía network interception
 *   del POST /travels, no vía URL redirect.
 * - Evidencia primaria: recorder test-4.spec.ts (reproduce el mismo flow end-to-end).
 */
import { expect } from '@playwright/test';
import { test } from '../../../../../../../TestBase';
import { DashboardPage, NewTravelPage, TravelDetailPage, TravelManagementPage } from '../../../../../../../pages/carrier';
import { expectNoThreeDSModal, loginAsDispatcher, TEST_DATA } from '../../../../../fixtures/gateway.fixtures';
import { validateCardPrecondition } from '../../../../../helpers/card-precondition';
import { captureCreatedTravelId, cancelTravelIfCreated, type TravelIdRef } from '../../../../../helpers/travel-cleanup';
import { PASSENGERS } from '../../../../../data/passengers';
import { debugLog } from '../../../../../../../helpers';

// Flujo: carrier web crea viaje con método "Tarjeta de Crédito - Cargo a Bordo".
// No hay formulario Stripe ni 3DS desde carrier. El cobro ocurre en Driver App al finalizar.
// Con cliente appPax el pasajero se auto-asigna (ng-reflect-is-disabled="true") — no llamar selectPassenger.

test.use({ role: 'carrier', storageState: undefined });
test.describe.configure({ timeout: 120_000 });

function extractTravelId(url: string): string {
	const match = url.match(/\/travels\/([\w-]+)/);
	if (!match) throw new Error(`No se pudo extraer el travelId desde: ${url}`);
	return match[1];
}

test.describe('Gateway PG · Carrier · App Pax — Cargo a Bordo', () => {

	test('[TS-STRIPE-TC1081] @smoke @cargo-a-bordo pago exitoso sin 3DS', async ({ page }) => {
		const dashboard = new DashboardPage(page);
		const travel = new NewTravelPage(page);
		const management = new TravelManagementPage(page);
		const detail = new TravelDetailPage(page);
		let travelIdRef: TravelIdRef | null = null;

		await test.step('Login carrier', async () => {
			await loginAsDispatcher(page);
		});

		await test.step('Precondición: validar tarjeta 4242 vinculada al pasajero appPax', async () => {
			const check = await validateCardPrecondition(page, {
				passengerName: PASSENGERS.appPax.apiSearchQuery!,
				requiredLast4: '4242',
			});
			debugLog('gateway-pg:carrier', `[card-precondition] ${PASSENGERS.appPax.name}: ${check.activeCards} tarjetas, tiene 4242: ${check.hasRequiredCard}, limpiadas: ${check.cardsDeleted}`);
			if (!check.hasRequiredCard) {
				throw new Error(
					`[TC1081] PRECONDICIÓN NO CUMPLIDA: pasajero appPax sin tarjeta 4242 activa (tarjetas activas: ${check.activeCards}). Vincular manualmente en TEST antes de ejecutar.`
				);
			}
		});

		try {
			travelIdRef = await captureCreatedTravelId(page);

			await test.step('Ir al formulario de nuevo viaje', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('Completar formulario con método Cargo a Bordo', async () => {
				// Con cliente appPax el pasajero se auto-asigna — no llamar selectPassenger
				await travel.selectClient(TEST_DATA.appPaxPassenger);
				await travel.setOrigin(TEST_DATA.origin);
				await travel.setDestination(TEST_DATA.destination);
				await travel.selectPaymentMethod('CargoABordo');
			});

			await test.step('Seleccionar vehiculo y enviar el viaje', async () => {
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			});

			await test.step('Verificar que no aparece modal 3DS', async () => {
				await expectNoThreeDSModal(page);
			});

			await test.step('Confirmar creación del viaje via network interception', async () => {
				// Cargo a Bordo con AppPax post-submit puede quedarse en /travel/create?limitExceeded=false
				// como comportamiento normal del producto. La fuente de verdad es el POST /travels
				// interceptado por captureCreatedTravelId.
				await expect
					.poll(() => travelIdRef?.travelId, {
						timeout: 15_000,
						message: '[TC1081] POST /travels no capturó travelId tras el submit',
					})
					.not.toBeNull();
			});

			await test.step('Validar viaje en gestion - columna Por asignar con estado Buscando chofer', async () => {
				await management.goto();
				await management.expectPassengerInPorAsignar(TEST_DATA.appPaxPassenger, undefined, 'Buscando chofer');
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
