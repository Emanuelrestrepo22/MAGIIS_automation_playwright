/**
 * KATA Steps (orquestador de flujo) — Carrier · Clonación de Viajes (Operaciones).
 *
 * Cubre TS-STRIPE-P2-TC066..071 (clonación de CANCELADOS) y TC072..077 (clonación de
 * FINALIZADOS). Cada escenario ARMA SU PROPIA PRECONDICIÓN (self-contained):
 *
 *   1. Seed — compone `CarrierHoldSteps.runHoldScenario` para crear el viaje fuente con TODAS
 *      las convenciones vigentes (login, idempotencia de tarjeta card-new, oráculo de outcome
 *      real de la validación, verificación en "Por Asignar"). Su cleanup interno CANCELA el
 *      viaje al retornar → queda exactamente la precondición "viaje CANCELADO".
 *   2. (Solo finalizados) `finalizeTravelAdmin` — transición CANCELLED → DONE de la máquina de
 *      estados del BE (finalización administrativa, ver `travel-finalize.ts` y su caveat: el BE
 *      convierte el pago del viaje fuente a CASH; el sujeto del TC — clonar un FINALIZADO y dar
 *      de alta el clon con tarjeta preautorizada — se ejercita fiel).
 *   3. Clonar — ATC `CarrierTravelManagementPage.cloneTravel` (pestaña → filtro → fa-files-o →
 *      form de alta PRECARGADO con `?travelId=`).
 *   4. Completar el alta del clon según la variante (card-new / card-existing / 3DS) y validar
 *      el desenlace con el MISMO oráculo que los specs de hold (viaje en "Por Asignar").
 *   5. Cleanup — cancela el viaje clonado; restaura hold=ON si la variante lo apagó.
 *
 * Convención KATA: extiende UiBase; instancia Page components internamente; imports por alias.
 * NOTA @atc: el ATC de clonación vive en `CarrierTravelManagementPage.cloneTravel` (MG-428);
 * este Step orquesta, no mapea TCs directamente.
 *
 * FRAGILE / TODO(live): el form precargado del clon se conoce por ingeniería inversa del FE
 * (`gotToClone` → `travelCreate?travelId=` → `getTravel()` prellena cliente/pasajero/lugares y
 * método de pago del viaje fuente). Validar en la primera corrida viva: prefill de lugares,
 * estado del selector de pago y submit del clon.
 */

import type { TestContextOptions } from '@TestContext';

import { test, expect } from '@TestFixture';
import { UiBase } from '@ui/UiBase';
import { ThreeDsChallengePage } from '@ui/ThreeDsChallengePage';
import { CarrierNewTravelPage, CarrierTravelManagementPage, type CloneSourceTab } from '@ui/carrier';
import { CarrierHoldSteps, type CardFlow } from './CarrierHoldSteps';
import { debugLog } from '@helpers/index';
import { expectNoThreeDSModal, STRIPE_TEST_CARDS } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { setHoldViaApi, getCarrierParameters } from '@features/gateway-pg/helpers/parameters-api';
import { extractAuthToken, cleanupGatewayCardByLast4 } from '@features/gateway-pg/helpers/card-precondition';
import { finalizeTravelAdmin } from '@features/gateway-pg/helpers/travel-finalize';
import {
	captureCreatedTravelId,
	cancelTravelDetailed,
	cancelTravelIfCreated,
	type TravelIdRef
} from '@features/gateway-pg/helpers/travel-cleanup';
import { waitForTravelCreation } from '@features/gateway-pg/helpers/stripe.helpers';

export type CloneScenario = {
	client: string;
	passenger: string;
	origin: string;
	destination: string;
	/** Override del last4; por defecto se deriva de `threeDs` (3DS requerida vs successDirect). */
	cardLast4?: string;
	/** Query API para la precondición/limpieza de tarjeta del pasajero. */
	apiSearchQuery?: string;
};

export type CloneRunOptions = {
	/** Pestaña fuente del clonado (estado del viaje fuente). */
	source: Extract<CloneSourceTab, 'cancelados' | 'finalizados'>;
	/** Estado del hold del carrier durante TODO el escenario (alta fuente + alta del clon). */
	hold: 'on' | 'off';
	/** true = tarjeta 3DS en el alta del clon (challenge aprobado); false = verifica que NO aparezca. */
	threeDs: boolean;
	/** 'new' vincula tarjeta nueva en el clon; 'existing' reutiliza la guardada por el seed. */
	cardFlow: CardFlow;
};

function shortDestination(destination: string): string {
	return destination.split(',')[0].trim();
}

export class CarrierCloneSteps extends UiBase {
	readonly management: CarrierTravelManagementPage;
	readonly travel: CarrierNewTravelPage;
	readonly threeDs: ThreeDsChallengePage;

	constructor(options: TestContextOptions) {
		super(options);
		const opts = { page: this.page };
		this.management = new CarrierTravelManagementPage(opts);
		this.travel = new CarrierNewTravelPage(opts);
		this.threeDs = new ThreeDsChallengePage(opts);
	}

	/**
	 * Orquestador reusable de clonación. El seed compone `runHoldScenario` (misma pasarela de
	 * convenciones que los specs de hold) y este método agrega la fase de clonado + alta del clon.
	 */
	async runCloneScenario(scenario: CloneScenario, options: CloneRunOptions): Promise<void> {
		const holdSteps = new CarrierHoldSteps({ page: this.page });
		const cardLast4 =
			scenario.cardLast4 ??
			(options.threeDs ? STRIPE_TEST_CARDS.threeDSRequired.slice(-4) : STRIPE_TEST_CARDS.successDirect.slice(-4));
		const shortDest = shortDestination(scenario.destination);
		// Ref propio ADEMÁS del interno de runHoldScenario: los listeners de response coexisten y
		// éste conserva el travelId del viaje FUENTE (runHoldScenario no lo retorna) para la
		// finalización administrativa. También cachea el JWT para las llamadas API posteriores.
		const seedRef: TravelIdRef = await captureCreatedTravelId(this.page);
		let cloneRef: TravelIdRef | null = null;

		try {
			await test.step(`Seed: viaje fuente cancelado (alta hold=${options.hold}, ${options.threeDs ? '3DS' : 'sin 3DS'})`, async () => {
				// El cleanup interno de runHoldScenario CANCELA el viaje al salir → precondición
				// "viaje CANCELADO" lista. restoreHold=false: la variante sin hold debe mantener el
				// hold apagado también durante el alta del CLON (se restaura en el finally de acá).
				await holdSteps.runHoldScenario(
					{
						client: scenario.client,
						passenger: scenario.passenger,
						origin: scenario.origin,
						destination: scenario.destination,
						apiSearchQuery: scenario.apiSearchQuery,
						cardFlow: 'new'
					},
					{ hold: options.hold, threeDs: options.threeDs, restoreHold: false }
				);
				expect(seedRef.travelId, 'El seed debe haber capturado el travelId del viaje fuente').not.toBeNull();
			});

			// Snapshot + dispose del listener del seed ANTES de la fase de clonado (review
			// 2026-08-05, CRITICAL-1): captureCreatedTravelId sobreescribe ref.travelId en CADA
			// POST /travels — vivo durante el alta del clon, ambos refs capturaban el MISMO id y
			// el assert de identidad clon≠fuente se auto-derrotaba (12 tests rojos por diseño).
			const sourceTravelId = seedRef.travelId as number;
			const sourceTravelIdForCarrier = seedRef.travelIdForCarrier ?? undefined;
			await seedRef.dispose();

			// Verificacion explicita de la PRECONDICION cancelado + GATE de blocker (2026-08-06): el
			// cleanup interno de runHoldScenario cancela en silencio; con el endpoint de cancel roto
			// (5xx SQLGrammarException) el fuente NO esta CANCELADO -> ni la pestania Cancelados ni
			// finalizeAdmin (CANCELLED->DONE) son alcanzables. ok o 4xx (ya cancelado) -> seguir.
			await test.step('Precondición: verificar cancelación del fuente (gate blocker 5xx)', async () => {
				const cancel = await cancelTravelDetailed(this.page, sourceTravelId);
				test.skip(
					cancel.status >= 500,
					`BLOQUEADO backend TEST: cancel ${sourceTravelId} -> ${cancel.status} ${cancel.body.slice(0, 120)}`
				);
			});

			if (options.source === 'finalizados') {
				await test.step('Seed: finalización administrativa (CANCELLED → DONE) vía API', async () => {
					const finalized = await finalizeTravelAdmin(this.page, sourceTravelId);
					expect(
						finalized,
						`finalizeAdmin debe aceptar la transición CANCELLED → DONE del viaje ${sourceTravelId} (ver travel-finalize.ts)`
					).toBe(true);
				});
			}

			if (options.cardFlow === 'new') {
				await test.step('Precondición: limpiar tarjeta previa del pax (idempotencia card-new del clon)', async () => {
					// El seed re-vinculó la tarjeta al pax; BL-050 bloquea "Validar" si el MISMO número
					// ya está vinculado → se limpia por API antes de vincular la nueva en el clon.
					// Warm-up del JWT (patrón retry ×3 — ver runHoldScenario).
					let token: string | null = null;
					for (let attempt = 0; attempt < 3 && !token; attempt++) {
						token = await extractAuthToken(this.page);
					}
					if (!token) {
						debugLog(
							'gateway-pg:clone',
							'[card-cleanup] JWT no capturado tras 3 intentos — cleanup correrá sin auth y no-op'
						);
					}
					const queries = [scenario.passenger, ...(scenario.apiSearchQuery ? [scenario.apiSearchQuery] : [])];
					await cleanupGatewayCardByLast4(this.page, queries, cardLast4);
				});
			}

			await test.step(`Clonar viaje desde Gestión de Viajes (pestaña ${options.source})`, async () => {
				await this.management.goto();
				await this.management.cloneTravel(shortDest, options.source, sourceTravelId, sourceTravelIdForCarrier);
			});

			await test.step('Verificar formulario de alta precargado con los datos del viaje fuente', async () => {
				await this.travel.ensureLoaded();
				// Prefill token-based (el portal muestra "apellido, nombre" + teléfono).
				// TODO(live): validar prefill de origen/destino — `getTravel()` del FE los repuebla,
				// pero el formato exacto del texto no es asertable sin corrida viva.
				await this.travel.assertClientSelected(scenario.client);
			});

			cloneRef = await captureCreatedTravelId(this.page);

			await test.step(`Vincular tarjeta en el clon (cardFlow=${options.cardFlow}${options.threeDs ? ', 3DS' : ''})`, async () => {
				if (options.cardFlow === 'existing') {
					await this.travel.selectSavedPreauthorizedCard(cardLast4);
				} else {
					await this.travel.selectCardByLast4(cardLast4);
				}
			});

			// Flag anti-verde-vacío (review 2026-08-05, MEDIUM-3): en las variantes 3DS SIN hold no
			// hay hold que falle si el challenge nunca aparece — sin este flag el test pasaría como
			// un alta no-3DS, perdiendo en silencio el sujeto "con validación 3DS" de la matriz.
			// Con hold ON el oráculo de estado final ya protege (challenge no aprobado ⇒ NO_AUTH).
			let challengeSeen = false;

			if (options.threeDs) {
				await test.step('Aprobar modal 3DS de Stripe (validación del clon)', async () => {
					if (await this.threeDs.waitForOptionalVisible(5_000)) {
						challengeSeen = true;
						await this.threeDs.completeSuccess();
						await this.threeDs.waitForHidden();
					}
				});
			}

			await test.step('Seleccionar vehículo y enviar el clon', async () => {
				await this.travel.clickSelectVehicle();
				await this.travel.clickSendService();
			});

			if (options.threeDs) {
				await test.step('Aprobar 3DS adicional si aparece post-envío', async () => {
					if (await this.threeDs.waitForOptionalVisible(5_000)) {
						challengeSeen = true;
						await this.threeDs.completeSuccess();
						await this.threeDs.waitForHidden();
					}
				});
			} else {
				await test.step('Verificar que no aparece modal 3DS', async () => {
					await expectNoThreeDSModal(this.page);
				});
			}

			await test.step('Esperar alta del clon completa', async () => {
				await waitForTravelCreation(this.page);
			});

			if (options.threeDs && options.hold === 'off') {
				expect(
					challengeSeen,
					'Variante 3DS sin hold: el challenge DEBE haberse presentado en alguna de las dos ventanas — sin hold no hay oráculo de estado que detecte su ausencia (MEDIUM-3)'
				).toBe(true);
			}

			// `expect.poll`, NO assert síncrono: el handler de `captureCreatedTravelId` es async y
			// puede resolver después del assert (race confirmada en vivo 2026-08-21 sobre
			// `CarrierHoldSteps`, donde el log mostró el travelId capturado y el assert falló igual).
			// Preventivo acá: mismo patrón — assert de travelId post-submit del clon.
			await expect
				.poll(() => cloneRef?.travelId ?? null, {
					message: 'POST /travels del clon debe haber capturado travelId',
					timeout: 10_000
				})
				.not.toBeNull();
			// La identidad clon≠fuente se evalúa DESPUÉS del poll, con el valor ya establecido.
			expect(cloneRef.travelId, 'El clon debe ser un viaje NUEVO (id distinto del fuente)').not.toBe(
				sourceTravelId
			);

			await test.step('Validar viaje clonado en gestión — columna Por Asignar', async () => {
				await this.management.goto();
				await this.management.expectPassengerInPorAsignar(scenario.passenger, shortDest);
			});
		} finally {
			// seedRef ya fue disposeado al cerrar la fase de seed (CRITICAL-1); dispose es
			// idempotente (page.off), llamarlo de nuevo acá sería inocuo pero innecesario.
			if (cloneRef) {
				await test.step('Cleanup: cancelar viaje clonado', async () => {
					await cancelTravelIfCreated(this.page, cloneRef!);
				});
			}
			if (options.hold === 'off') {
				await test.step('Restaurar hold al final del test', async () => {
					await setHoldViaApi(this.page, true);
					// Read-back CRUDO (misma disciplina que CarrierHoldSteps.enableHoldViaApi).
					const persisted = await getCarrierParameters(this.page);
					expect(
						persisted.enableCreditCardHold,
						'read-back API: enableCreditCardHold debe quedar true tras restaurar'
					).toBe(true);
				});
			}
		}
	}
}
