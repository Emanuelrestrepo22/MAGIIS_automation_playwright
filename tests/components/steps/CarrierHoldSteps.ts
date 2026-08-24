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
 *
 * ── ROL EN LA ARQUITECTURA (declarado 2026-07-29) ────────────────────────────────────────────
 * ⚠️ `runHoldScenario` NO es el motor de hold de las pasarelas de form nativo. Hoy alimenta:
 *   · el spec PILOTO parametrizado `specs/_parametrized/hold-happy-no3ds.parametrized.spec.ts` (`[BL-028]`), y
 *   · el camino Stripe Elements (`fillMinimum` + los 3 iframes).
 *
 * El motor productivo de **Authorize / eBizCharge / Mercado Pago** (form nativo Angular) es
 * `runStepwiseHoldJourney` (`@features/gateway-pg/helpers/stepwise-hold-journey`): a pedido del líder
 * de QA (2026-07-27) cada paso lleva su propia assertion, para que el step que falla identifique el
 * punto exacto sin abrir el trace — algo que este orquestador, al ser una "caja negra" de journey
 * completo, no da. La bifurcación es DELIBERADA; ambos motores coexisten a propósito.
 * Antes de refactorizar cualquiera de los dos, leer también el docblock del otro.
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
import { getCarrierParameters, readHoldRaw, setHoldViaApi } from '@features/gateway-pg/helpers/parameters-api';
import { assertAuthorizeAccountMeasuresRealAuthorizations } from '@features/gateway-pg/helpers/authorize-account-guard';
import {
	cleanupGatewayCardByLast4,
	extractAuthToken,
	validateCardPrecondition,
	type CardPreconditionResult
} from '@features/gateway-pg/helpers/card-precondition';
import {
	captureCreatedTravelId,
	cancelTravelIfCreated,
	type TravelIdRef
} from '@features/gateway-pg/helpers/travel-cleanup';
// `waitForTravelCreation` y `shortDestination` viven los dos en `journey-url.helpers`;
// `stripe.helpers` solo re-exporta el primero, asi que se importa del modulo canonico.
import { shortDestination, waitForTravelCreation } from '@features/gateway-pg/helpers/journey-url.helpers';

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

	/** Habilita el hold vía API (BL-i18n/v1.72.8) y verifica el efecto con read-back CRUDO (GET posterior). */
	async enableHoldViaApi(): Promise<void> {
		await setHoldViaApi(this.page, true);
		// Read-back CRUDO como oráculo (auditoría R2): assertar el payload que `setHoldViaApi`
		// acababa de mutar era tautológico. UN solo GET posterior y los 3 campos de hold se
		// assertan desde ESE objeto leído del backend — campo ausente (undefined) = fallo.
		const persisted = await getCarrierParameters(this.page);
		expect(persisted.enableCreditCardHold, 'read-back API: enableCreditCardHold debe quedar true tras el POST (campo ausente = fallo)').toBe(true);
		expect(persisted.ccHoldPreviousHs, 'read-back API: ccHoldPreviousHs debe persistir en 2 (campo ausente = fallo)').toBe(2);
		expect(persisted.ccHoldCoverage, 'read-back API: ccHoldCoverage debe persistir en 10 (campo ausente = fallo)').toBe(10);
	}

	/**
	 * Deshabilita el hold vía API y verifica el efecto con READ-BACK CRUDO (GET posterior).
	 *
	 * Endurecimiento de oráculo (auditoría R2): el assert anterior sobre el payload
	 * retornado por `setHoldViaApi` era tautológico — validaba el objeto que la propia
	 * función acababa de mutar, no el estado persistido en el backend. El read-back usa
	 * `readHoldRaw` (sin coerción): un campo ausente FALLA en vez de pasar como `false`.
	 *
	 * El oráculo UI del toggle "Aplicar Pre-Autorización" es NO-automatizable: la pantalla
	 * Configuración Parámetros está rota (BL-i18n/v1.72.8 — el toggle no habilita Guardar
	 * ni persiste, ver header de `parameters-api.ts`) → el read-back es vía API.
	 */
	async disableHoldViaApi(): Promise<void> {
		await setHoldViaApi(this.page, false);
		expect(await readHoldRaw(this.page), 'read-back API: enableCreditCardHold debe quedar false tras el POST (campo ausente = fallo)').toBe(false);
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
	 *   - mercado-pago: `validateAndSelectMercadoPagoCard` (contrato tri-estado, oráculo tarjeta
	 *     resaltada): 'linked' continúa; 'validation-unavailable' → test.skip (limitación sandbox
	 *     MP en TEST — incluye el error explícito "Error al validar tarjeta", su manifestación
	 *     documentada; UAT-only); 'validation-failed' RESERVADO (guard future-proof, hoy inerte).
	 *   - authorize/ebizcharge: "Validar" + oráculo de ESTADO (Forma de Pago resuelta a
	 *     "*** <last4>" — live 2026-07-28, ver CarrierNewTravelPage.validateNativeCard).
	 */
	private async validateNativeGatewayCard(gateway: GatewayName, cardLast4: string): Promise<void> {
		if (gateway === 'mercado-pago') {
			const mpLink = await validateAndSelectMercadoPagoCard(this.page);
			// Guard future-proof (hoy INERTE): 'validation-failed' está RESERVADO a evidencia live
			// (UAT/entorno transaccional) de un fallo distinguible de la limitación sandbox — hoy
			// ningún camino lo retorna en TEST (el error explícito "Error al validar tarjeta" es la
			// manifestación documentada del sandbox → habilita el skip de abajo).
			expect(mpLink, 'MP: señal de fallo real de validación distinguible de la limitación sandbox (evidencia live)').not.toBe('validation-failed');
			test.skip(
				mpLink !== 'linked',
				'MP: validación de tarjeta no completa en TEST (sandbox MP no transacciona) — UAT-only. Form-fill + habilitación de "Validar" verificados.'
			);
			return;
		}
		await this.travel.validateNativeCard(cardLast4);
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
		// Gate de VALIDEZ DE MEDICIÓN (ronda 4 del RUN-LOG): con Authorize hay DOS cuentas en juego
		// y la de `.env.test` está en Test Mode — devuelve respuestas enlatadas, así que el hold
		// "aprueba" sin autorizar nada y el test daría un VERDE VACÍO. Falla ruidosa acá, antes de
		// crear el viaje, en vez de reportar cobertura inexistente. Memoizado por worker (1 request).
		if (gateway === 'authorize') {
			await assertAuthorizeAccountMeasuresRealAuthorizations();
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

		// Precondición de idempotencia (form nativo): si la MISMA tarjeta quedó vinculada al
		// pax por un run previo, el alta diverge y "Tarjeta válida" nunca aparece (falso
		// negativo confirmado live 2026-07-27 — el piloto hold reproducía el fallo que WAL
		// evitaba con su cleanup). Mismo helper compartido; silent-fail por query.
		if (adapter.cardForm === 'native-angular') {
			await test.step('Precondición: limpiar tarjeta nativa previa (idempotencia)', async () => {
				// Warm-up del JWT ANTES del cleanup (root-cause live 2026-07-28): extractAuthToken
				// sin retry devuelve null recién logueado → 401 → catch silencioso por query →
				// cleanup no-op y el alta diverge a tarjeta-guardada. Patrón retry ×3 establecido
				// (allcards beforeAll). Con cache poblado, getApiHeaders del cleanup ya no falla.
				let token: string | null = null;
				for (let attempt = 0; attempt < 3 && !token; attempt++) {
					token = await extractAuthToken(this.page);
				}
				if (!token) {
					debugLog('gateway-pg:carrier', '[card-cleanup] JWT no capturado tras 3 intentos — cleanup correrá sin auth y no-op');
				}
				const queries = [scenario.passenger, ...(adapter.journeyDefaults.paxSearchQueries ?? [])];
				await cleanupGatewayCardByLast4(this.page, queries, cardLast4);
			});
		}

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
					// Rama tarjeta-vigente (live 2026-07-27, screenshot): con la tarjeta del pax ya
					// vinculada, el dropdown la PRESELECCIONA y el form nativo no se renderiza —
					// fill+Validar divergen y "Tarjeta válida" nunca aparece (falso negativo).
					// Oráculo funcional de esta rama: la selección visible "*** <last4>".
					if (await this.travel.isSavedCardPreselected(cardLast4)) {
						debugLog('gateway-pg:hold', `[card] tarjeta guardada *** ${cardLast4} preseleccionada — se omite fill/Validar (rama CARD-EXISTING nativa)`);
					} else {
						await this.travel.selectPaymentMethod('Preautorizada');
						await cardFormFor(gateway).fill(this.page, card);
						await this.validateNativeGatewayCard(gateway, cardLast4);
					}
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
