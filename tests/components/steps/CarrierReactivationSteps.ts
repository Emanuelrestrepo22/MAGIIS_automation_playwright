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
import { CarrierHoldSteps, type CardFlow } from './CarrierHoldSteps';
import { loginAsDispatcher, STRIPE_TEST_CARDS } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { setHoldViaApi, getCarrierParameters } from '@features/gateway-pg/helpers/parameters-api';
import { captureCreatedTravelId, cancelTravel, cancelTravelDetailed, type TravelIdRef } from '@features/gateway-pg/helpers/travel-cleanup';
import { waitForTravelCreation } from '@features/gateway-pg/helpers/stripe.helpers';

export type ReactivationScenario = {
	client: string;
	passenger: string;
	origin: string;
	destination: string;
	/** Override del last4; por defecto tarjeta preautorizada sin 3DS (successDirect). */
	cardLast4?: string;
};

/**
 * Escenario de las VARIANTES de reactivación (TS-STRIPE-P2-TC061..065). El caso ancla TC060
 * conserva su flujo original en `runReactivateCancelledPreauth` (sin cambios, multi-session
 * safety); las variantes arman la precondición componiendo `CarrierHoldSteps.runHoldScenario`
 * (hereda idempotencia de tarjeta, oráculo de outcome real y cancelación en cleanup — el viaje
 * queda CANCELADO al retornar, exactamente la precondición que la reactivación necesita).
 */
export type ReactivationVariantScenario = ReactivationScenario & {
	/** Query API para la precondición/limpieza de tarjeta del pasajero. */
	apiSearchQuery?: string;
};

export type ReactivationRunOptions = {
	/** Estado del hold del carrier durante el alta fuente Y la reactivación. */
	hold: 'on' | 'off';
	/** true = alta fuente con tarjeta 3DS (challenge aprobado). */
	threeDs: boolean;
	/** 'new' vincula tarjeta nueva en el alta fuente; 'existing' exige tarjeta ya vinculada (o skip). */
	cardFlow: CardFlow;
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
		let reactivatedId: number | null = null;

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
				const cancel = await cancelTravelDetailed(this.page, createdId as number);
				// GATE de blocker externo (2026-08-06): 5xx = endpoint de cancelacion roto server-side
				// (SQLGrammarException) — la PRECONDICION es imposible, no el sujeto del TC. Skip con
				// motivo (misma semantica que los gates de Appium); un rojo aca mis-señalaria
				// "reactivacion rota". 4xx/otros = fallo real de la precondicion -> assert.
				test.skip(cancel.status >= 500, `BLOQUEADO backend TEST: cancel ${createdId} -> ${cancel.status} ${cancel.body.slice(0, 120)}`);
				expect(cancel.ok, `La cancelación del viaje debe ser exitosa (status ${cancel.status}: ${cancel.body.slice(0, 160)})`).toBe(true);
			});

			await test.step('Reactivar el viaje cancelado desde Gestión de Viajes', async () => {
				await this.management.goto();
				// Anclaje por código WEB del seed (fix 2026-08-05 travelId, migrado 2026-08-12 a
				// travelIdForCarrier — el href de travelId está muerto desde v1.72.8, confirmado en
				// vivo): sin ancla, la primera coincidencia por texto en el carrier compartido podia
				// ser una fila ya-reactivada/ajena (review MEDIUM-4).
				await this.management.reactivate(scenario.passenger, shortDest, createdId as number, travelIdRef?.travelIdForCarrier ?? undefined);
			});

			await test.step('Verificar reactivación — navega al despacho/asignación de conductores', async () => {
				// URL real observada en TEST v1.72.8: /#/home/carrier/driver/list/Assign?id=<nuevoTravelId>
				// (el análisis FE mencionaba `listDriverOnline`; el runtime navega a `driver/list/Assign`).
				await expect(this.page).toHaveURL(/driver\/list\/Assign|listDriverOnline/i, { timeout: 15_000 });
				// El id del viaje reactivado viaja en la URL → lo capturamos para el cleanup.
				const match = this.page.url().match(/[?&]id=(\d+)/);
				if (match) reactivatedId = Number(match[1]);
			});
		} finally {
			// El viaje original ya se canceló en la precondición; acá cancelamos el REACTIVADO
			// (queda activo en despacho tras reactivar). Best-effort — no debe romper el test.
			await travelIdRef?.dispose();
			if (reactivatedId !== null) {
				await test.step('Cleanup: cancelar viaje reactivado', async () => {
					await cancelTravel(this.page, reactivatedId as number).catch(() => undefined);
				});
			}
		}
	}

	/**
	 * Reactiva un viaje CANCELADO ya existente (precondición armada por el caller) y cancela el
	 * reactivado en cleanup. Asume sesión carrier logueada. Mismos pasos/oráculo que el tramo de
	 * reactivación del caso ancla TC060 (URL real observada en TEST v1.72.8).
	 *
	 * FRAGILE conocido (heredado del ancla): tras filtrar se reactiva la PRIMERA coincidencia con
	 * botón Reactivar visible — el FE oculta el botón en filas ya reactivadas (`!item.isReactivated`)
	 * y el viaje recién cancelado suele ser el más reciente.
	 */
	async reactivateSeededCancelledTrip(
		scenario: Pick<ReactivationScenario, 'passenger' | 'destination'>,
		seededTravelId?: number,
		seededTravelIdForCarrier?: number
	): Promise<void> {
		const shortDest = scenario.destination.split(',')[0].trim();
		let reactivatedId: number | null = null;

		try {
			await test.step('Reactivar el viaje cancelado desde Gestión de Viajes', async () => {
				await this.management.goto();
				// Anclaje por código WEB del seed cuando está disponible (fix 2026-08-05 travelId,
				// migrado 2026-08-12 a travelIdForCarrier — href muerto desde v1.72.8).
				await this.management.reactivate(scenario.passenger, shortDest, seededTravelId, seededTravelIdForCarrier);
			});

			await test.step('Verificar reactivación — navega al despacho/asignación de conductores', async () => {
				// URL real observada en TEST v1.72.8 (ver runReactivateCancelledPreauth).
				await expect(this.page).toHaveURL(/driver\/list\/Assign|listDriverOnline/i, { timeout: 15_000 });
				const match = this.page.url().match(/[?&]id=(\d+)/);
				if (match) reactivatedId = Number(match[1]);
			});
		} finally {
			if (reactivatedId !== null) {
				await test.step('Cleanup: cancelar viaje reactivado', async () => {
					await cancelTravel(this.page, reactivatedId as number).catch(() => undefined);
				});
			}
		}
	}

	/**
	 * Orquestador de las VARIANTES de reactivación (TC061..065): seed vía
	 * `CarrierHoldSteps.runHoldScenario` (el viaje queda CANCELADO por su cleanup interno,
	 * con hold ON/OFF y tarjeta nueva/existente/3DS según la variante) + reactivación con el
	 * mismo oráculo del ancla TC060. Con hold OFF, el hold se mantiene apagado TAMBIÉN durante
	 * la reactivación ("sin Hold desde Alta de Viaje" aplica al journey completo) y se restaura
	 * al final del test.
	 *
	 * FRAGILE / TODO(live) — variantes 3DS: la reactivación re-ejecuta el hold server-side
	 * (`cloneTravel` del FE). Con la tarjeta ya autenticada en el alta, el hold off-session no
	 * debería re-desafiar 3DS; si el PSP exigiera re-autenticación, el viaje reactivado caería
	 * en NO_AUTORIZADO y este oráculo (URL de despacho) lo reportaría. Validar en corrida viva.
	 */
	async runReactivationScenario(scenario: ReactivationVariantScenario, options: ReactivationRunOptions): Promise<void> {
		const holdSteps = new CarrierHoldSteps({ page: this.page });
		// Listener propio para conocer el travelId del seed (runHoldScenario no lo retorna) —
		// disciplina snapshot+dispose ANTES de la fase de reactivacion (review CRITICAL-1: la
		// reactivacion dispara su propio POST /travels y un listener vivo lo sobreescribiria).
		const seedRef = await captureCreatedTravelId(this.page);

		try {
			await test.step(`Seed: viaje cancelado (alta hold=${options.hold}, ${options.threeDs ? '3DS' : 'sin 3DS'}, tarjeta ${options.cardFlow})`, async () => {
				// restoreHold=false: la variante sin hold reactiva con el hold aún apagado; se
				// restaura en el finally de este orquestador.
				await holdSteps.runHoldScenario(
					{
						client: scenario.client,
						passenger: scenario.passenger,
						origin: scenario.origin,
						destination: scenario.destination,
						cardLast4: scenario.cardLast4,
						apiSearchQuery: scenario.apiSearchQuery,
						cardFlow: options.cardFlow
					},
					{ hold: options.hold, threeDs: options.threeDs, restoreHold: false }
				);
			});

			const seededTravelId = seedRef.travelId;
			const seededTravelIdForCarrier = seedRef.travelIdForCarrier;
			await seedRef.dispose();
			// Verificacion explicita de la PRECONDICION cancelado (2026-08-06): el cleanup interno de
			// runHoldScenario cancela en silencio (catch) — si el endpoint esta roto (5xx blocker) el
			// viaje NO queda cancelado y la fase de reactivacion fallaria con señal equivocada.
			// ok=true (cancelo aca) o 4xx (ya cancelado por el cleanup interno) -> precondicion lista.
			if (seededTravelId) {
				const cancel = await cancelTravelDetailed(this.page, seededTravelId);
				test.skip(cancel.status >= 500, `BLOQUEADO backend TEST: cancel ${seededTravelId} -> ${cancel.status} ${cancel.body.slice(0, 120)}`);
			}
			await this.reactivateSeededCancelledTrip(scenario, seededTravelId ?? undefined, seededTravelIdForCarrier ?? undefined);
		} finally {
			if (options.hold === 'off') {
				await test.step('Restaurar hold al final del test', async () => {
					await setHoldViaApi(this.page, true);
					// Read-back CRUDO (misma disciplina que CarrierHoldSteps.enableHoldViaApi).
					const persisted = await getCarrierParameters(this.page);
					expect(persisted.enableCreditCardHold, 'read-back API: enableCreditCardHold debe quedar true tras restaurar').toBe(true);
				});
			}
		}
	}
}
