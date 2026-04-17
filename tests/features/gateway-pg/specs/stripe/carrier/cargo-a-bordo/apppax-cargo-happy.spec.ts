/**
 * TCs: TS-STRIPE-TC1081
 * Feature: Cargo a Bordo — Tarjeta de Crédito — Usuario App Pax — Pago exitoso
 * Tags: @smoke @cargo-a-bordo @web-only
 *
 * Precondiciones:
 * - El pasajero appPax (Emanuel Restrepo) debe tener una tarjeta vinculada y activa
 *   en el sistema MAGIIS con capacidad para Cargo a Bordo.
 * - El límite de crédito del pasajero no debe estar bloqueado (limitExceeded=false
 *   en la URL indica que la creación fue rechazada por el backend — verificar
 *   configuración del pasajero en el entorno TEST antes de ejecutar).
 * - Evidencia primaria: recorder test-17.spec.ts
 */
import { expect } from '@playwright/test';
import { test } from '../../../../../../TestBase';
import { DashboardPage, NewTravelPage, TravelDetailPage, TravelManagementPage } from '../../../../../../pages/carrier';
import { expectNoThreeDSModal, loginAsDispatcher, TEST_DATA } from '../../../../fixtures/gateway.fixtures';
import { validateCardPrecondition } from '../../../../helpers/card-precondition';
import { captureCreatedTravelId, cancelTravelIfCreated, type TravelIdRef } from '../../../../helpers/travel-cleanup';
import { PASSENGERS } from '../../../../data/passengers';

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
			console.log(`[card-precondition] ${PASSENGERS.appPax.name}: ${check.activeCards} tarjetas, tiene 4242: ${check.hasRequiredCard}, limpiadas: ${check.cardsDeleted}`);
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

			await test.step('Esperar redirección al detalle del viaje creado', async () => {
				// El backend puede rechazar el viaje con ?limitExceeded=false si el pasajero
				// no tiene tarjeta Cargo a Bordo activa o hay restricción de límite de crédito.
				// En ese caso, el test falla con un mensaje de precondición en lugar de un timeout ciego.
				const result = await Promise.race([
					page.waitForURL(/\/travels\/[\w-]+$/, { timeout: 15_000 })
						.then(() => 'success' as const),
					page.waitForURL(/limitExceeded/, { timeout: 15_000 })
						.then(() => 'limitExceeded' as const),
				]).catch(() => 'timeout' as const);

				if (result === 'limitExceeded') {
					throw new Error(
						'[TC1081] PRECONDICIÓN NO CUMPLIDA: el backend rechazó la creación del viaje con limitExceeded=false. ' +
						'Verificar que el pasajero appPax (Emanuel Restrepo) tenga tarjeta activa para Cargo a Bordo en el entorno TEST.'
					);
				}

				if (result === 'timeout') {
					throw new Error(
						'[TC1081] TIMEOUT: la URL no redirigió al detalle del viaje ni mostró limitExceeded. ' +
						'Revisar el estado del viaje en el entorno TEST y los logs del servidor.'
					);
				}
			});

			expect(travelIdRef?.travelId, 'POST /travels debe haber capturado travelId').not.toBeNull();

			const createdTravelId = extractTravelId(page.url());

			await test.step('Validar viaje en gestion - columna Por asignar', async () => {
				await management.goto();
				await management.expectPassengerInPorAsignar(TEST_DATA.appPaxPassenger, TEST_DATA.destination);
			});

			await test.step('Abrir detalle del viaje recien creado', async () => {
				await management.openDetailForPassenger(TEST_DATA.appPaxPassenger, TEST_DATA.destination);
				await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
				expect(extractTravelId(page.url())).toBe(createdTravelId);
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
