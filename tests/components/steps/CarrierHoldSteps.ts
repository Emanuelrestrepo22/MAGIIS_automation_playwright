/**
 * KATA Steps (orquestador de flujo) — Carrier · Alta de Viaje con Hold (pre-autorización).
 *
 * Extrae los orquestadores compartidos que estaban duplicados en cada spec de hold
 * (`runHoldOnScenario` / `runHoldOffScenario`, resolución de `cardFlow`, set de hold por
 * API, aprobación 3DS) a un único Step reusable KATA. Un Step orquesta varios ATC de las
 * Page components (@ui/carrier + @ui/ThreeDsChallengePage) y helpers de dominio.
 *
 * Convención KATA aplicada:
 *   - Extiende UiBase (usa `this.page`); instancia las Page components internamente.
 *   - Import por alias (@ui, @features, @helpers, @utils, @TestFixture) — sin relativos nuevos.
 *   - `runHoldScenario` es el orquestador reusable; los pasos atómicos (login, hold API,
 *     cardFlow, 3DS) se exponen para specs con forma propia (ej. app pax sin 3DS).
 *
 * NOTA @atc — los ATC mapeados a MG viven en las Page components (fillMinimum → MG-148,
 * expectPassengerInPorAsignar → MG-158, 3DS → MG-152/153); este Step orquesta, no mapea
 * TCs directamente.
 */

import type { TestContextOptions } from '@TestContext';

import { test, expect } from '@TestFixture';
import { UiBase } from '@ui/UiBase';
import { ThreeDsChallengePage } from '@ui/ThreeDsChallengePage';
import {
	CarrierDashboardPage,
	CarrierNewTravelPage,
	CarrierOperationalPreferencesPage,
	CarrierTravelManagementPage
} from '@ui/carrier';
import { debugLog } from '@helpers/index';
import {
	expectNoThreeDSModal,
	loginAsDispatcher,
	STRIPE_TEST_CARDS
} from '@features/gateway-pg/fixtures/gateway.fixtures';
import { setHoldViaApi } from '@features/gateway-pg/helpers/parameters-api';
import { validateCardPrecondition, type CardPreconditionResult } from '@features/gateway-pg/helpers/card-precondition';
import {
	captureCreatedTravelId,
	cancelTravelIfCreated,
	type TravelIdRef
} from '@features/gateway-pg/helpers/travel-cleanup';
import { waitForTravelCreation } from '@features/gateway-pg/helpers/stripe.helpers';

export type CardFlow = 'new' | 'existing';

export type HoldScenario = {
	client: string;
	passenger: string;
	origin: string;
	destination: string;
	/** Override del last4 de la tarjeta; si se omite se deriva de `options.threeDs`. */
	cardLast4?: string;
	/** Query API para resolver la precondición de tarjeta del pasajero. */
	apiSearchQuery?: string;
	/** 'new' fuerza vinculación nueva; 'existing' exige tarjeta ya vinculada (o test.skip). */
	cardFlow?: CardFlow;
};

export type HoldRunOptions = {
	/** 'on' = hold habilitado; 'off' = hold deshabilitado y restaurado al final. */
	hold: 'on' | 'off';
	/** true = aprueba el modal 3DS; false = verifica que NO aparezca. */
	threeDs: boolean;
	/** Resolver `cardFlow` vía API (default true). false = preferSavedCard=false directo. */
	useCardFlow?: boolean;
	/** Capturar y cancelar el travelId creado (cleanup). Default true. */
	trackTravelId?: boolean;
	/** Esperar el alta de viaje completa (waitForTravelCreation). Default true. */
	waitForCreation?: boolean;
	/** Esperar habilitación del botón Seleccionar Vehículo antes del click. Default false. */
	waitForVehicleReady?: boolean;
	/** Filtrar por destino corto en la validación de gestión. Default true. */
	matchDestination?: boolean;
	/** Estado esperado en la fila de gestión (ej. 'Buscando chofer'). Opcional. */
	expectStatus?: string;
};

function shortDestination(destination: string): string {
	return destination.split(',')[0].trim();
}

export class CarrierHoldSteps extends UiBase {
	readonly dashboard: CarrierDashboardPage;
	readonly preferences: CarrierOperationalPreferencesPage;
	readonly travel: CarrierNewTravelPage;
	readonly management: CarrierTravelManagementPage;
	readonly threeDs: ThreeDsChallengePage;

	constructor(options: TestContextOptions) {
		super(options);
		const opts = { page: this.page };
		this.dashboard = new CarrierDashboardPage(opts);
		this.preferences = new CarrierOperationalPreferencesPage(opts);
		this.travel = new CarrierNewTravelPage(opts);
		this.management = new CarrierTravelManagementPage(opts);
		this.threeDs = new ThreeDsChallengePage(opts);
	}

	/** Login como dispatcher carrier. */
	async login(): Promise<void> {
		await loginAsDispatcher(this.page);
	}

	/** Habilita el hold vía API (BL-i18n/v1.72.8) y valida los parámetros posteados. */
	async enableHoldViaApi(): Promise<void> {
		const params = await setHoldViaApi(this.page, true);
		expect(params.enableCreditCardHold).toBe(true);
		expect(params.ccHoldPreviousHs).toBe(2);
		expect(params.ccHoldCoverage).toBe(10);
	}

	/** Deshabilita el hold vía API y valida el parámetro posteado. */
	async disableHoldViaApi(): Promise<void> {
		const params = await setHoldViaApi(this.page, false);
		expect(params.enableCreditCardHold).toBe(false);
	}

	/**
	 * Resuelve la precondición de tarjeta según `cardFlow`.
	 *  - 'new': valida (para cleanup) y fuerza preferSavedCard=false.
	 *  - 'existing': exige hasRequiredCard=true, sino test.skip() con motivo.
	 */
	async resolveCardFlow(
		scenario: HoldScenario,
		cardLast4: string
	): Promise<{ cardCheck: CardPreconditionResult | null; preferSavedCard: boolean }> {
		const cardFlow: CardFlow = scenario.cardFlow ?? 'new';
		let cardCheck: CardPreconditionResult | null = null;

		if (scenario.apiSearchQuery) {
			cardCheck = await validateCardPrecondition(this.page, {
				passengerName: scenario.apiSearchQuery,
				requiredLast4: cardLast4
			});
			debugLog(
				'gateway-pg:carrier',
				`[card-precondition] ${scenario.passenger} (cardFlow=${cardFlow}): ${cardCheck.activeCards} tarjetas, tiene ${cardLast4}: ${cardCheck.hasRequiredCard}`
			);
		}

		if (cardFlow === 'existing') {
			test.skip(
				!cardCheck?.hasRequiredCard,
				`[card-existing] Precondición: pasajero ${scenario.passenger} debe tener tarjeta ${cardLast4} vinculada.`
			);
			return { cardCheck, preferSavedCard: true };
		}

		return { cardCheck, preferSavedCard: false };
	}

	/** Aprueba el challenge 3DS si aparece (wait corto no-bloqueante). */
	async approve3dsIfPresent(timeout = 5_000): Promise<void> {
		if (await this.threeDs.waitForOptionalVisible(timeout)) {
			await this.threeDs.completeSuccess();
			await this.threeDs.waitForHidden();
		}
	}

	/** Verifica que NO aparezca el modal 3DS (flujos sin autenticación). */
	async expectNoThreeDs(): Promise<void> {
		await expectNoThreeDSModal(this.page);
	}

	/**
	 * Orquestador reusable de alta de viaje con hold. Cubre hold ON/OFF × 3DS/no-3DS y
	 * ambos card-flows. Los pasos concretos se decoran vía las Page components (@atc/@step).
	 */
	async runHoldScenario(scenario: HoldScenario, options: HoldRunOptions): Promise<void> {
		const useCardFlow = options.useCardFlow ?? true;
		const trackTravelId = options.trackTravelId ?? true;
		const waitForCreation = options.waitForCreation ?? true;
		const matchDestination = options.matchDestination ?? true;
		const cardLast4 =
			scenario.cardLast4 ??
			(options.threeDs
				? STRIPE_TEST_CARDS.alwaysAuthenticate.slice(-4)
				: STRIPE_TEST_CARDS.successDirect.slice(-4));
		let travelIdRef: TravelIdRef | null = null;

		await test.step('Login carrier', async () => {
			await this.login();
		});

		let preferSavedCard = false;
		if (useCardFlow) {
			await test.step(`Precondición: resolver flujo de tarjeta (cardFlow=${scenario.cardFlow ?? 'new'})`, async () => {
				const resolved = await this.resolveCardFlow(scenario, cardLast4);
				preferSavedCard = resolved.preferSavedCard;
			});
		}

		try {
			if (trackTravelId) {
				travelIdRef = await captureCreatedTravelId(this.page);
			}

			if (options.hold === 'on') {
				await test.step('Validar que el hold esté activado en preferencias operativas', async () => {
					await this.preferences.goto();
					await this.preferences.ensureHoldEnabled();
					await this.preferences.assertHoldEnabled();
				});
			} else {
				await test.step('Desactivar hold en preferencias operativas', async () => {
					await this.disableHoldViaApi();
				});
			}

			await test.step('Ir al formulario de nuevo viaje', async () => {
				await this.dashboard.openNewTravel();
				await this.travel.ensureLoaded();
			});

			await test.step(`Completar formulario con tarjeta ${options.threeDs ? '3DS' : 'sin 3DS'}`, async () => {
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
					await this.approve3dsIfPresent();
				});
			}

			await test.step('Seleccionar vehículo y enviar el viaje', async () => {
				if (options.waitForVehicleReady) {
					await this.travel.waitForVehicleSelectionReady();
				}
				await this.travel.clickSelectVehicle();
				await this.travel.clickSendService();
			});

			if (options.threeDs) {
				await test.step('Aprobar 3DS adicional si aparece post-envío', async () => {
					await this.approve3dsIfPresent();
				});
			} else {
				await test.step('Verificar que no aparece modal 3DS', async () => {
					await this.expectNoThreeDs();
				});
			}

			if (waitForCreation) {
				await test.step('Esperar alta de viaje completa', async () => {
					await waitForTravelCreation(this.page);
				});
			}

			if (trackTravelId) {
				expect(travelIdRef?.travelId, 'POST /travels debe haber capturado travelId').not.toBeNull();
			}

			await test.step('Validar viaje en gestión — columna Por Asignar', async () => {
				await this.management.goto();
				await this.management.expectPassengerInPorAsignar(
					scenario.passenger,
					matchDestination ? shortDestination(scenario.destination) : undefined,
					options.expectStatus
				);
			});
		} finally {
			if (trackTravelId && travelIdRef) {
				await test.step('Cleanup: cancelar viaje creado', async () => {
					await cancelTravelIfCreated(this.page, travelIdRef!);
				});
			}
			if (options.hold === 'off') {
				await test.step('Restaurar hold al final del test', async () => {
					await this.enableHoldViaApi();
				});
			}
		}
	}
}
