/**
 * KATA Steps (orquestador de flujo) — Carrier · Viajes Recurrentes (área REC).
 *
 * Cubre TS-STRIPE-P2-TC041..046 (colaborador), TC048..053 (app pax / personal) y TC054..059
 * (empresa individuo): "vinculación/selección de tarjeta y Alta de Viaje Recurrente desde
 * carrier" × hold ON/OFF × con/sin 3DS. TC047 (edición de fechas + consistencia + finalización)
 * queda fixme — su oráculo requiere App Driver.
 *
 * HALLAZGO DE ARQUITECTURA (define el oráculo de creación — fuente FE/BE, ingeniería inversa):
 * el alta recurrente NO tiene endpoint propio. Es el alta de viaje PROGRAMADO de siempre
 * (POST `carriers/{id}/travels`, `addTravelcommand.ts`) con `recurringValue`/`recurringEnd`/
 * `recurringPattern` en el payload; el BE (`TravelService.java` ~1577) crea el contenedor
 * `RecurringTrip` + el travel SCHEDULED en ese MISMO POST cuando `recurringValue > 0`.
 * Consecuencias:
 *   - `captureCreatedTravelId` (patrón POST /travels) captura el alta recurrente tal cual;
 *   - el cleanup correcto es la RECURRENCIA (PUT `recurringTrip/{id}/delete` — el BE cancela
 *     además las instancias pendientes), no solo el travel de la primera ocurrencia;
 *   - el "Cobro desde App Driver" del título de la matriz es la fase mobile (fuera del alcance
 *     web — mismo recorte que la suite de hold, ver TC1301-1303).
 *
 * Cada escenario ARMA SU PROPIA PRECONDICIÓN (self-contained, mismas convenciones que
 * `CarrierHoldSteps.runHoldScenario` — se COMPONEN sus átomos públicos, no se duplica lógica):
 *   1. Login + (cardFlow 'new') limpieza de idempotencia BL-050 con warm-up del JWT ×3.
 *   2. (cardFlow 'existing') `resolveCardFlow` — exige la tarjeta ya vinculada o test.skip.
 *   3. Hold ON/OFF por API con read-back CRUDO (patrón CarrierEditVariantsSteps.setHold).
 *   4. Alta: `fillMinimum` (tarjeta + validación con outcome real) → `schedulePickupAtLastSlot`
 *      (viaje PROGRAMADO — prerequisito del botón de recurrencia) → `configureRecurrence`.
 *   5. 3DS según variante (ventana post-validación y post-envío; flag `challengeSeen` para la
 *      variante 3DS sin hold — anti-verde-vacío MEDIUM-3, mismo patrón que CarrierCloneSteps).
 *   6. Oráculos: viaje en pestaña PROGRAMADOS con estado válido (un hold NO_AUTH lo saca de ahí
 *      — protege las variantes hold ON) + recurrencia listada en "Viajes Recurrentes" (el
 *      desenlace DISTINTIVO del área REC: pasajero + periodicidad).
 *   7. Cleanup en finally ANCLADO a la corrida (review HIGH-1): snapshot del max id de
 *      recurrencias PRE-alta y borrado por API sólo de una recurrencia POSTERIOR a él y con el
 *      POST /travels confirmado (jamás "la más nueva que matchee el find" — matchearía
 *      recurrencias ajenas); cinturón `cancelTravelIfCreated`; restaura hold=ON. Los specs
 *      además re-aseguran hold=ON en `afterEach` (review MEDIUM-4): un timeout aborta este
 *      finally y el afterEach es el camino que sobrevive.
 *
 * Convención KATA: extiende UiBase; instancia Page components internamente; imports por alias.
 * NOTA @atc: el ATC del área vive en `CarrierRecurrentTravelPage.configureRecurrence` (MG-390,
 * mapeo por área aceptado); este Step orquesta, no mapea TCs directamente.
 *
 * FRAGILE / TODO(live): la fase de recurrencia (modal + datepicker PrimeNG) sale del código FE
 * sin corrida viva — ver header de CarrierRecurrentTravelPage. NO se promete verde.
 */

import type { TestContextOptions } from '@TestContext';
import type { GenericTestCard } from '@fixtures/gateways/_shared';

import { test, expect } from '@TestFixture';
import { UiBase } from '@ui/UiBase';
import { ThreeDsChallengePage } from '@ui/ThreeDsChallengePage';
import {
	CarrierDashboardPage,
	CarrierNewTravelPage,
	CarrierRecurrentTravelPage,
	CarrierTravelManagementPage
} from '@ui/carrier';
import { CarrierHoldSteps, type CardFlow } from './CarrierHoldSteps';
import { debugLog } from '@helpers/index';
import { resolveCard } from '@fixtures/gateways/_shared';
import { expectNoThreeDSModal, loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { setHoldViaApi, getCarrierParameters, readHoldRaw } from '@features/gateway-pg/helpers/parameters-api';
import { extractAuthToken, cleanupGatewayCardByLast4 } from '@features/gateway-pg/helpers/card-precondition';
import {
	deleteRecurringTripNewerThan,
	deleteRecurringTripViaApi,
	findRecurringTripCreatedAfter,
	maxActiveRecurringTripId
} from '@features/gateway-pg/helpers/recurring-cleanup';
import {
	captureCreatedTravelId,
	cancelTravelIfCreated,
	type TravelIdRef
} from '@features/gateway-pg/helpers/travel-cleanup';
// Import directo desde el módulo dueño (review INFO-2): `stripe.helpers` es sólo un barrel
// deprecado que re-exporta este helper gateway-agnóstico.
import { waitForTravelCreation } from '@features/gateway-pg/helpers/journey-url.helpers';

/**
 * Estados VÁLIDOS de la fila de un viaje recurrente recién creado (pestaña Programados).
 * Se aceptan también los estados de viaje activo (un driver pudo tomarlo); lo que NO se acepta
 * es "No autorizado"/"En conflicto" — hold fallido, y en esa pestaña la fila directamente no está.
 */
const RECURRENT_TRIP_ROW_STATUS =
	/Viaje programado|Scheduled Trip|Buscando chofer|Searching Driver|En progreso|In Progress/i;

export type RecurrentScenario = {
	client: string;
	passenger: string;
	origin: string;
	destination: string;
	/** Query API para precondición/limpieza de tarjeta y para el `find` del listado/cleanup. */
	apiSearchQuery?: string;
	/** 'new' vincula tarjeta nueva (default); 'existing' exige tarjeta ya vinculada (o skip). */
	cardFlow?: CardFlow;
};

export type RecurrentRunOptions = {
	/**
	 * Estado del hold del carrier durante el alta. 'off' se restaura a ON en el finally; los
	 * specs re-aseguran ON en su `afterEach` (`ensureHoldRestoredOn`) porque un timeout del test
	 * aborta el finally (review MEDIUM-4).
	 */
	hold: 'on' | 'off';
	/** true = tarjeta 3DS (challenge aprobado); false = verifica que NO aparezca el modal. */
	threeDs: boolean;
	/** Config de la recurrencia. Defaults: repetir cada 1 día, fin hoy+2 (ventana corta). */
	recurrence?: { repeatEveryDays?: number; endInDays?: number };
};

function shortDestination(destination: string): string {
	return destination.split(',')[0].trim();
}

export class RecurrentesSteps extends UiBase {
	readonly dashboard: CarrierDashboardPage;
	readonly travel: CarrierNewTravelPage;
	readonly recurrent: CarrierRecurrentTravelPage;
	readonly management: CarrierTravelManagementPage;
	readonly threeDs: ThreeDsChallengePage;

	constructor(options: TestContextOptions) {
		super(options);
		const opts = { page: this.page };
		this.dashboard = new CarrierDashboardPage(opts);
		this.travel = new CarrierNewTravelPage(opts);
		this.recurrent = new CarrierRecurrentTravelPage(opts);
		this.management = new CarrierTravelManagementPage(opts);
		this.threeDs = new ThreeDsChallengePage(opts);
	}

	/** Fija el hold por API con read-back CRUDO (misma disciplina que CarrierHoldSteps/EditVariants). */
	private async setHold(state: 'on' | 'off'): Promise<void> {
		await setHoldViaApi(this.page, state === 'on');
		if (state === 'on') {
			const persisted = await getCarrierParameters(this.page);
			expect(
				persisted.enableCreditCardHold,
				'read-back API: enableCreditCardHold debe quedar true tras el POST'
			).toBe(true);
		} else {
			expect(
				await readHoldRaw(this.page),
				'read-back API: enableCreditCardHold debe quedar false tras el POST'
			).toBe(false);
		}
	}

	/** Limpieza de idempotencia de tarjeta (BL-050) con warm-up del JWT ×3 (patrón runHoldScenario). */
	private async cleanupPaxCard(scenario: RecurrentScenario, cardLast4: string): Promise<void> {
		let token: string | null = null;
		for (let attempt = 0; attempt < 3 && !token; attempt++) {
			token = await extractAuthToken(this.page);
		}
		if (!token) {
			debugLog(
				'gateway-pg:recurrente',
				'[card-cleanup] JWT no capturado tras 3 intentos — cleanup correrá sin auth y no-op'
			);
		}
		const queries = [scenario.passenger, ...(scenario.apiSearchQuery ? [scenario.apiSearchQuery] : [])];
		await cleanupGatewayCardByLast4(this.page, queries, cardLast4);
	}

	/**
	 * Orquestador reusable del alta RECURRENTE. Cubre hold ON/OFF × 3DS/no-3DS × card new/existing
	 * — las 6 variantes por actor de la matriz §4/§5/§6.
	 */
	async runRecurrentScenario(scenario: RecurrentScenario, options: RecurrentRunOptions): Promise<void> {
		const holdSteps = new CarrierHoldSteps({ page: this.page });
		const cardFlow: CardFlow = scenario.cardFlow ?? 'new';
		const card: GenericTestCard = resolveCard({
			gateway: 'stripe',
			intent: options.threeDs ? 'HAPPY_AUTH' : 'HAPPY_NO_AUTH'
		});
		const cardLast4 = card.last4;
		const repeatEveryDays = options.recurrence?.repeatEveryDays ?? 1;
		const endInDays = options.recurrence?.endInDays ?? 2;
		const recurringFind = scenario.apiSearchQuery ?? scenario.passenger;
		let travelIdRef: TravelIdRef | null = null;
		// Ancla del cleanup y del oráculo de identidad (review HIGH-1 / LOW-5): max id de
		// recurrencias ACTIVAS que matchean el find ANTES del alta (null = listado falló) y el id
		// de la recurrencia detectada como creada por ESTA corrida.
		let maxRecurringIdBefore: number | null = null;
		let createdRecurringId: number | null = null;
		// Anti-verde-vacío (MEDIUM-3, patrón CarrierCloneSteps): en 3DS SIN hold no hay estado
		// final que delate un challenge ausente — el flag exige haberlo visto. Con hold ON el
		// oráculo de la pestaña Programados ya protege (challenge no aprobado ⇒ NO_AUTH ⇒ la
		// fila no está en Programados).
		let challengeSeen = false;

		await test.step('Login carrier', async () => {
			await loginAsDispatcher(this.page);
		});

		if (cardFlow === 'new') {
			await test.step('Precondición: limpiar tarjeta previa del pax (idempotencia BL-050)', async () => {
				await this.cleanupPaxCard(scenario, cardLast4);
			});
		}

		let preferSavedCard = false;

		await test.step(`Precondición: resolver flujo de tarjeta (cardFlow=${cardFlow})`, async () => {
			// Átomo público de CarrierHoldSteps: 'existing' exige la tarjeta vinculada o test.skip.
			const resolved = await holdSteps.resolveCardFlow(
				{
					client: scenario.client,
					passenger: scenario.passenger,
					destination: scenario.destination,
					apiSearchQuery: scenario.apiSearchQuery,
					cardFlow
				},
				cardLast4
			);
			preferSavedCard = resolved.preferSavedCard;
		});

		try {
			await test.step(`Configurar hold=${options.hold} vía API (read-back crudo)`, async () => {
				await this.setHold(options.hold);
			});

			travelIdRef = await captureCreatedTravelId(this.page);

			await test.step('Snapshot: recurrencias ACTIVAS preexistentes que matchean el find (ancla del cleanup)', async () => {
				// Review HIGH-1: el find del listado es LAXO ('smith' también matchea 'Nayla Smith').
				// El max id PRE-alta permite operar después SOLO sobre una recurrencia más nueva que
				// él — la de esta corrida. Si el listado falla (null), el cleanup preferirá el leak
				// antes que borrar una recurrencia ajena (ver maxActiveRecurringTripId).
				maxRecurringIdBefore = await maxActiveRecurringTripId(this.page, recurringFind);
			});

			await test.step('Ir al formulario de nuevo viaje', async () => {
				await this.dashboard.openNewTravel();
				await this.travel.ensureLoaded();
			});

			await test.step(`Completar formulario con tarjeta ${options.threeDs ? '3DS' : 'sin 3DS'} (•••• ${cardLast4})`, async () => {
				await this.travel.fillMinimum({
					client: scenario.client,
					passenger: scenario.passenger,
					origin: scenario.origin,
					destination: scenario.destination,
					cardLast4,
					preferSavedCard
				});
			});

			if (options.threeDs) {
				await test.step('Aprobar modal 3DS de Stripe (validación inicial)', async () => {
					if (await this.threeDs.waitForOptionalVisible(5_000)) {
						challengeSeen = true;
						await this.threeDs.completeSuccess();
						await this.threeDs.waitForHidden();
					}
				});
			}

			await test.step('Programar el viaje (último horario del día — prerequisito de la recurrencia)', async () => {
				const slot = await this.travel.schedulePickupAtLastSlot();
				debugLog('gateway-pg:recurrente', `[alta] viaje programado para las ${slot}`);
			});

			await test.step(`Configurar recurrencia (repetir cada ${repeatEveryDays} día(s), fin hoy+${endInDays})`, async () => {
				await this.recurrent.configureRecurrence({ repeatEveryDays, endInDays });
			});

			await test.step('Seleccionar vehículo y enviar el viaje recurrente', async () => {
				await this.travel.clickSelectVehicle();
				await this.travel.clickSendService();
			});

			if (options.threeDs) {
				await test.step('Aprobar 3DS adicional si aparece post-envío', async () => {
					// 15s (no 5s): confirmado en vivo (TC052) que el challenge post-envío del alta
					// RECURRENTE tarda más en aparecer que en un alta normal — el POST extra crea el
					// RecurringTrip además del travel. Con 5s el check no lo detectaba, el challenge
					// quedaba sin aprobar y waitForTravelCreation agotaba sus 30s contra un modal
					// bloqueante nunca clickeado (evidencia: screenshot con "3D Secure 2 Test Page"
					// abierto en el momento del timeout).
					if (await this.threeDs.waitForOptionalVisible(15_000)) {
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

			await test.step('Esperar alta del viaje recurrente completa', async () => {
				await waitForTravelCreation(this.page);
			});

			if (options.threeDs && options.hold === 'off') {
				expect(
					challengeSeen,
					'Variante 3DS sin hold: el challenge DEBE haberse presentado en alguna de las dos ventanas — sin hold no hay oráculo de estado que detecte su ausencia (MEDIUM-3)'
				).toBe(true);
			}

			expect(
				travelIdRef.travelId,
				'POST /travels debe haber capturado el travelId del alta recurrente (mismo endpoint que el alta normal — ver header)'
			).not.toBeNull();

			await test.step('Validar viaje en gestión — pestaña Programados con estado válido', async () => {
				// Un viaje recurrente nace SCHEDULED (BE: updateRTDBTravelsNode(..., SCHEDULED)) —
				// vive en Programados, no en "Por Asignar". Un hold NO_AUTH lo manda a
				// "En conflicto" y esta fila desaparece: este oráculo protege las variantes hold ON.
				// Verificación SOBRE la pestaña recién abierta (review MEDIUM-1 — el método
				// PorAsignar re-clickeaba "Asignar" por dentro) y ANCLADA al código WEB del POST
				// (travelIdForCarrier, "NNNN-W" — fila determinística en el carrier compartido).
				// NO se ancla por travelId/href: confirmado en vivo que v1.72.8 eliminó esos
				// anchors de esta grilla (mismo idioma que expectTravelInEnConflicto).
				await this.management.goto();
				await this.management.openScheduledTrips();
				await this.management.expectTripRowInCurrentTab({
					passenger: scenario.passenger,
					destination: shortDestination(scenario.destination),
					status: RECURRENT_TRIP_ROW_STATUS,
					travelIdForCarrier: travelIdRef?.travelIdForCarrier ?? undefined
				});
			});

			await test.step('Validar la recurrencia en el listado "Viajes Recurrentes"', async () => {
				// Anclaje a ESTA corrida (review LOW-5): el grid sólo publica nombre+periodicidad y
				// el find laxo también matchea recurrencias ajenas — primero se resuelve por API la
				// recurrencia NUEVA (id > snapshot pre-alta) y recién después se verifica que la
				// superficie UI la liste.
				if (maxRecurringIdBefore !== null) {
					const created = await findRecurringTripCreatedAfter(this.page, recurringFind, maxRecurringIdBefore);
					expect(
						created,
						`El alta debe haber creado una recurrencia ACTIVA nueva (id > ${maxRecurringIdBefore}) para find="${recurringFind}" — sin ella, cualquier fila del listado sería de otra corrida`
					).not.toBeNull();
					createdRecurringId = created?.id ?? null;
				}
				await this.recurrent.goto();
				await this.recurrent.openRecurringTab();
				await this.recurrent.searchInList(recurringFind);
				await this.recurrent.expectRecurrenceListed(scenario.passenger, repeatEveryDays);
			});
		} finally {
			await test.step('Cleanup: eliminar la recurrencia creada por esta corrida (cancela sus instancias)', async () => {
				// 1. Borrar la recurrencia ANCLADA a esta corrida (review HIGH-1). Doble candado:
				//    (a) el POST /travels debe haber capturado travelId (sin alta no hay nada nuestro
				//    que borrar), y (b) sólo se borra el id detectado como NUEVO (> snapshot) — jamás
				//    "la más nueva que matchee el find" a secas, que podía ser una recurrencia AJENA
				//    ('smith' matchea 'Nayla Smith'). Silent-fail: un cleanup roto no debe tapar el
				//    desenlace; ante duda se prefiere el leak (diagnosticable por warn) al borrado ajeno.
				//    NOTA infra (2026-08-11): el carrier TEST tiene un cron diario que limpia
				//    Programados/Recurrentes/Históricos (mismo proceso que apaga el server 00-07 por
				//    ahorro de costos) — un leak acá NO es permanente, se autolimpia dentro del día.
				if (travelIdRef?.travelId != null) {
					if (createdRecurringId !== null) {
						await deleteRecurringTripViaApi(this.page, createdRecurringId);
					} else if (maxRecurringIdBefore !== null) {
						await deleteRecurringTripNewerThan(this.page, recurringFind, maxRecurringIdBefore);
					} else {
						console.warn(
							'[recurrentes] snapshot de recurrencias no disponible — no se borra ninguna recurrencia por seguridad (leak transitorio, se autolimpia con el cron diario del carrier TEST)'
						);
					}
				}
				// 2. Cancelar SIEMPRE el travel capturado como cinturón: cubre el fallo antes del
				//    POST (no-op con id null), el borrado de recurrencia fallido, y el caso borde
				//    "POST hecho pero recurrencia no creada / borrada otra leftover" — cancelar un
				//    viaje ya cancelado por el BE solo emite un warn tolerado (cancelTravel no lanza).
				if (travelIdRef) {
					await cancelTravelIfCreated(this.page, travelIdRef);
				}
			});

			if (options.hold === 'off') {
				await test.step('Restaurar hold al final del test', async () => {
					await this.setHold('on');
				});
			}
		}
	}
}
