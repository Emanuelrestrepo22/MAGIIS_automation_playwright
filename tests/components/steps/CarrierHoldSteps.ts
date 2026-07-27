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
import type { GatewayName, GenericTestCard } from '@fixtures/gateways/_shared';

import { test, expect } from '@TestFixture';
import { UiBase } from '@ui/UiBase';
import { ThreeDsChallengePage } from '@ui/ThreeDsChallengePage';
import {
	CarrierDashboardPage,
	CarrierNewTravelPage,
	CarrierOperationalPreferencesPage,
	CarrierTravelManagementPage
} from '@ui/carrier';
import { cardFormFor } from '@ui/carrier/card-forms';
import { debugLog } from '@helpers/index';
import { resolveCard } from '@fixtures/gateways/_shared';
import { getGatewayPgAdapter } from '@features/gateway-pg/helpers/adapters';
import { expectNoThreeDSModal, loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { validateAndSelectMercadoPagoCard } from '@features/gateway-pg/helpers/mercadoPago.helpers';
import { readHoldEnabled, setHoldViaApi } from '@features/gateway-pg/helpers/parameters-api';
import { validateCardPrecondition, type CardPreconditionResult } from '@features/gateway-pg/helpers/card-precondition';
import {
	captureCreatedTravelId,
	cancelTravelIfCreated,
	type TravelIdRef
} from '@features/gateway-pg/helpers/travel-cleanup';
import { waitForTravelCreation } from '@features/gateway-pg/helpers/stripe.helpers';

export type CardFlow = 'new' | 'existing';

export type HoldScenario = {
	/**
	 * Pasarela del journey (S7). Default 'stripe' (comportamiento histórico intacto).
	 * No-stripe: login con creds por pasarela, tarjeta vía `resolveCard({gateway,intent})`
	 * + `cardFormFor(gateway)` (form nativo Angular), y branch 3DS solo si
	 * `adapter.requires3ds` (3DS es EXCLUSIVO Stripe).
	 */
	gateway?: GatewayName;
	client: string;
	passenger: string;
	/**
	 * Origen del viaje. Opcional (S7) SOLO para journeys no-stripe donde el cliente
	 * auto-asigna el origen (ej. cliente individuo MP); el flujo stripe (`fillMinimum`)
	 * lo sigue exigiendo.
	 */
	origin?: string;
	destination: string;
	/** Override del last4 de la tarjeta (SOLO stripe); si se omite se deriva del intent. */
	cardLast4?: string;
	/** Query API para resolver la precondición de tarjeta del pasajero. */
	apiSearchQuery?: string;
	/** 'new' fuerza vinculación nueva; 'existing' exige tarjeta ya vinculada (o test.skip). */
	cardFlow?: CardFlow;
};

export type HoldRunOptions = {
	/** 'on' = hold habilitado; 'off' = hold deshabilitado y restaurado al final. */
	hold: 'on' | 'off';
	/**
	 * true = aprueba el modal 3DS; false = verifica que NO aparezca.
	 * S7 + post-review A5: 3DS es EXCLUSIVO de Stripe — `threeDs: true` con un adapter
	 * sin 3DS LANZA (fail-fast; el caso está excluido de la matriz de esa pasarela,
	 * no se degrada silenciosamente a no-3DS).
	 */
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
	/**
	 * Con hold 'off': restaurar hold=ON al final (default true — comportamiento histórico
	 * de la suite Stripe). false = dejar el hold OFF (specs MP no-hold, que nunca lo
	 * restauraban — el estado del carrier ARG queda como el spec original lo dejaba).
	 */
	restoreHold?: boolean;
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

	/**
	 * Login como dispatcher carrier. `gateway` selecciona la cadena de credenciales por
	 * pasarela (`USER_CARRIER_<GW>_<ENV> → … → USER_CARRIER`); omitido = default histórico.
	 */
	async login(gateway?: GatewayName): Promise<void> {
		await loginAsDispatcher(this.page, gateway ? { gateway } : undefined);
	}

	/** Habilita el hold vía API (BL-i18n/v1.72.8) y valida los parámetros posteados. */
	async enableHoldViaApi(): Promise<void> {
		const params = await setHoldViaApi(this.page, true);
		expect(params.enableCreditCardHold).toBe(true);
		expect(params.ccHoldPreviousHs).toBe(2);
		expect(params.ccHoldCoverage).toBe(10);
	}

	/**
	 * Deshabilita el hold vía API y verifica el efecto con READ-BACK real (GET posterior).
	 *
	 * Endurecimiento de oráculo (auditoría R2): el assert anterior sobre el payload
	 * retornado por `setHoldViaApi` era tautológico — validaba el objeto que la propia
	 * función acababa de mutar, no el estado persistido en el backend.
	 *
	 * El oráculo UI del toggle "Aplicar Pre-Autorización" es NO-automatizable: la pantalla
	 * Configuración Parámetros está rota (BL-i18n/v1.72.8 — el toggle no habilita Guardar
	 * ni persiste, ver header de `parameters-api.ts`) → el read-back es vía API.
	 */
	async disableHoldViaApi(): Promise<void> {
		await setHoldViaApi(this.page, false);
		expect(await readHoldEnabled(this.page), 'read-back API: enableCreditCardHold debe quedar false tras el POST').toBe(false);
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
	 * Valida la tarjeta del form NATIVO según la pasarela (S7, privado — no es ATC):
	 *   - mercado-pago: `validateAndSelectMercadoPagoCard` (oráculo tarjeta resaltada) +
	 *     test.skip si la validación no completa en TEST (limitación sandbox MP — UAT-only).
	 *   - authorize/ebizcharge: "Validar" + oráculo "Tarjeta válida" (verificado live Authorize).
	 */
	private async validateNativeGatewayCard(gateway: GatewayName): Promise<void> {
		if (gateway === 'mercado-pago') {
			const mpLink = await validateAndSelectMercadoPagoCard(this.page);
			// Fallo real ≠ limitación de entorno (auditoría R2): un error EXPLÍCITO de
			// validación en la UI es un FALLO del test; solo la ausencia total de señal
			// (validation-unavailable) habilita el skip sandbox.
			expect(mpLink, 'MP: la UI mostró un error explícito de validación de tarjeta — fallo real, no limitación sandbox').not.toBe('validation-failed');
			test.skip(
				mpLink !== 'linked',
				'MP: validación de tarjeta no completa en TEST (sandbox MP no transacciona) — UAT-only. Form-fill + habilitación de "Validar" verificados.'
			);
			return;
		}
		await this.travel.validateNativeCard();
	}

	/**
	 * Orquestador reusable de alta de viaje con hold. Cubre hold ON/OFF × 3DS/no-3DS,
	 * ambos card-flows y (S7) las 4 pasarelas: la tarjeta se resuelve cross-gateway
	 * (`resolveCard`) y se llena con la estrategia del adapter (`cardFormFor`); el branch
	 * 3DS solo corre si `adapter.requires3ds && options.threeDs` (3DS EXCLUSIVO Stripe).
	 * Los pasos concretos se decoran vía las Page components (@atc/@step).
	 */
	async runHoldScenario(scenario: HoldScenario, options: HoldRunOptions): Promise<void> {
		const gateway: GatewayName = scenario.gateway ?? 'stripe';
		const adapter = getGatewayPgAdapter(gateway);
		// Fail-fast doctrina 3DS (post-review A5): 3DS es EXCLUSIVO de Stripe. Pedir
		// threeDs=true para un adapter sin 3DS es un error de invocación — el caso está
		// EXCLUIDO de la matriz de la pasarela, no se convierte silenciosamente en no-3DS.
		if (options.threeDs && !adapter.requires3ds) {
			throw new Error(
				`runHoldScenario: threeDs=true con gateway '${gateway}' (requires3ds=false) — 3DS es EXCLUSIVO de Stripe; ` +
					`no parametrizar threeDs para ${gateway} (doctrina: caso excluido, no convertido).`
			);
		}
		// 3DS: exclusivo de las pasarelas que lo soportan (hoy solo Stripe).
		const wants3ds = options.threeDs && adapter.requires3ds;
		const useCardFlow = options.useCardFlow ?? true;
		const trackTravelId = options.trackTravelId ?? true;
		const waitForCreation = options.waitForCreation ?? true;
		const matchDestination = options.matchDestination ?? true;
		const restoreHold = options.restoreHold ?? true;
		// Tarjeta cross-gateway por intent (reemplaza el fallback STRIPE_TEST_CARDS):
		// HAPPY_AUTH (3DS, solo Stripe) o HAPPY_NO_AUTH — mismos datos que el fallback histórico.
		const card: GenericTestCard = resolveCard({ gateway, intent: wants3ds ? 'HAPPY_AUTH' : 'HAPPY_NO_AUTH' });
		const cardLast4 = scenario.cardLast4 ?? card.last4;
		let travelIdRef: TravelIdRef | null = null;

		await test.step('Login carrier', async () => {
			await this.login(scenario.gateway);
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

			await test.step(`Completar formulario con tarjeta ${gateway} ${wants3ds ? '3DS' : 'sin 3DS'}`, async () => {
				if (gateway === 'stripe') {
					if (!scenario.origin) {
						throw new Error('runHoldScenario: `origin` es requerido en el flujo stripe (fillMinimum).');
					}
					await this.travel.fillMinimum({
						client: scenario.client,
						passenger: scenario.passenger,
						origin: scenario.origin,
						destination: scenario.destination,
						cardLast4,
						preferSavedCard
					});
				} else {
					// No-stripe (S7): formulario plano + método Preautorizada + estrategia de
					// card form del adapter (form nativo Angular) + validación por pasarela.
					await this.travel.fillPlain({
						client: scenario.client,
						passenger: scenario.passenger,
						origin: scenario.origin,
						destination: scenario.destination
					});
					await this.travel.selectPaymentMethod('Preautorizada');
					await cardFormFor(gateway).fill(this.page, card);
					await this.validateNativeGatewayCard(gateway);
				}
			});

			if (wants3ds) {
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

			if (wants3ds) {
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
			if (options.hold === 'off' && restoreHold) {
				await test.step('Restaurar hold al final del test', async () => {
					await this.enableHoldViaApi();
				});
			}
		}
	}
}
