/**
 * KATA Steps (orquestador) — Carrier · Reactivación de Viaje Cancelado (Operaciones).
 *
 * MG-178 FASE 2 — cubre TS-STRIPE-P2-TC060: reactivar un viaje cancelado que se pagó con
 * tarjeta preautorizada (hold). El test arma su propia precondición (alta con hold + cancelación
 * por API) y luego reactiva desde Gestión de Viajes, reutilizando toda la maquinaria existente
 * (hold API, alta de viaje, captura/cancelación de travelId).
 *
 * Convención KATA: extiende UiBase; instancia las Page components internamente; imports por alias.
 * NOTA @atc: el ATC de reactivación vive en `CarrierTravelManagementPage.reactivate` (MG-440 —
 * pendiente reasignar); este Step orquesta, no mapea TCs directamente.
 */

import type { TestContextOptions } from '@TestContext';

import { test, expect } from '@TestFixture';
import { UiBase } from '@ui/UiBase';
import {
	CarrierDashboardPage,
	CarrierNewTravelPage,
	CarrierTravelManagementPage,
} from '@ui/carrier';
import { loginAsDispatcher, STRIPE_TEST_CARDS } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { setHoldViaApi } from '@features/gateway-pg/helpers/parameters-api';
import { captureCreatedTravelId, cancelTravel, cancelTravelIfCreated, type TravelIdRef } from '@features/gateway-pg/helpers/travel-cleanup';
import { waitForTravelCreation } from '@features/gateway-pg/helpers/stripe.helpers';

export type ReactivationScenario = {
	client: string;
	passenger: string;
	origin: string;
	destination: string;
	/** Override del last4; por defecto tarjeta preautorizada sin 3DS (successDirect). */
	cardLast4?: string;
};

export class CarrierReactivationSteps extends UiBase {
	readonly dashboard: CarrierDashboardPage;
	readonly travel: CarrierNewTravelPage;
	readonly management: CarrierTravelManagementPage;

	constructor(options: TestContextOptions) {
		super(options);
		const opts = { page: this.page };
		this.dashboard = new CarrierDashboardPage(opts);
		this.travel = new CarrierNewTravelPage(opts);
		this.management = new CarrierTravelManagementPage(opts);
	}

	/**
	 * TS-STRIPE-P2-TC060 — reactivación de viaje cancelado con tarjeta preautorizada (hold, sin 3DS).
	 */
	async runReactivateCancelledPreauth(scenario: ReactivationScenario): Promise<void> {
		const cardLast4 = scenario.cardLast4 ?? STRIPE_TEST_CARDS.successDirect.slice(-4);
		const shortDest = scenario.destination.split(',')[0].trim();
		let travelIdRef: TravelIdRef | null = null;

		await test.step('Login carrier', async () => {
			await loginAsDispatcher(this.page);
		});

		await test.step('Habilitar hold (pre-autorización) vía API', async () => {
			const params = await setHoldViaApi(this.page, true);
			expect(params.enableCreditCardHold).toBe(true);
		});

		try {
			travelIdRef = await captureCreatedTravelId(this.page);

			await test.step('Precondición: crear viaje con tarjeta preautorizada', async () => {
				await this.dashboard.openNewTravel();
				await this.travel.ensureLoaded();
				await this.travel.fillMinimum({
					client: scenario.client,
					passenger: scenario.passenger,
					origin: scenario.origin,
					destination: scenario.destination,
					cardLast4,
				});
				await this.travel.clickSelectVehicle();
				await this.travel.clickSendService();
				await waitForTravelCreation(this.page);
			});

			const createdId = travelIdRef.travelId;
			expect(createdId, 'POST /travels debe haber capturado travelId').not.toBeNull();

			await test.step('Precondición: cancelar el viaje (queda CANCELADO)', async () => {
				const ok = await cancelTravel(this.page, createdId as number);
				expect(ok, 'La cancelación del viaje debe ser exitosa').toBe(true);
			});

			await test.step('Reactivar el viaje cancelado desde Gestión de Viajes', async () => {
				await this.management.goto();
				await this.management.reactivate(scenario.passenger, shortDest);
			});

			await test.step('Verificar reactivación — navega al despacho/asignación de conductores', async () => {
				// URL real observada en TEST v1.72.8: /#/home/carrier/driver/list/Assign?id=<nuevoTravelId>
				// (el análisis FE mencionaba `listDriverOnline`; el runtime navega a `driver/list/Assign`).
				await expect(this.page).toHaveURL(/driver\/list\/Assign|listDriverOnline/i, { timeout: 15_000 });
			});
		} finally {
			// Cleanup best-effort: el ref pudo re-capturar el travelId del viaje reactivado.
			if (travelIdRef) {
				await test.step('Cleanup: cancelar viaje (re)creado', async () => {
					await cancelTravelIfCreated(this.page, travelIdRef!);
				});
			}
		}
	}
}
