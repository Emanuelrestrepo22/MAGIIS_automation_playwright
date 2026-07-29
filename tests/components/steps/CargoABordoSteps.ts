/**
 * KATA Steps (orquestador de flujo) — Carrier · Alta de Viaje con método "Cargo a Bordo".
 *
 * Extrae la fase WEB compartida que estaba duplicada en cada spec de cargo-a-bordo
 * (`webPhaseCargoAppPax` / `webPhaseCargoContractor` / `webPhaseCargoEmpresa`) a un único
 * Step reusable KATA. La fase web es idéntica para los tres tipos de cliente (app pax,
 * colaborador/contractor, empresa individuo); la única variación es cliente/pasajero y
 * la precondición de tarjeta opcional. El cobro real (rechazos, 3DS, antifraud) ocurre
 * en la Driver App al finalizar el viaje — se representa como `test.fixme` (Appium
 * pendiente) vía `driverAppStep`.
 *
 * Convención KATA aplicada:
 *   - Extiende UiBase (usa `this.page`); instancia las Page components internamente.
 *   - Import por alias (@ui, @features, @helpers, @TestFixture) — sin relativos nuevos.
 *   - `runCargoScenario` es el orquestador reusable; orquesta los ATC de las Page
 *     components (`fillCargoABordo` → MG-161, `expectPassengerInPorAsignar` → MG-158).
 *
 * MULTI-PASARELA (2026-07-28) — el Step ya NO está atado a Stripe de forma implícita:
 * `CargoScenario.gateway` selecciona la cadena de credenciales del dispatcher y la fase
 * driver recibe la tarjeta por `driverAppStep.charge`, resuelta cross-gateway con
 * `resolveDriverCharge({gateway,intent})` (`@features/gateway-pg/helpers/cargo-driver-charge`).
 * Omitir `gateway` conserva el comportamiento histórico (Stripe / creds default).
 *
 * NOTA @atc — los ATC mapeados a MG viven en las Page components; este Step orquesta,
 * no mapea TCs directamente. MG-161 (área F cobro) / MG-158 (área E hold), ambos
 * mapeo por área aceptado (idmap API-level, sin 1:1 con TS-STRIPE-TC10xx UI).
 */

import type { TestContextOptions } from '@TestContext';
import type { GatewayName } from '@fixtures/gateways/_shared';

import { test, expect } from '@TestFixture';
import { UiBase } from '@ui/UiBase';
import { CarrierDashboardPage, CarrierNewTravelPage, CarrierTravelManagementPage } from '@ui/carrier';
import { debugLog } from '@helpers/index';
import { expectNoThreeDSModal, loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { validateCardPrecondition } from '@features/gateway-pg/helpers/card-precondition';
import {
	captureCreatedTravelId,
	cancelTravelIfCreated,
	type TravelIdRef
} from '@features/gateway-pg/helpers/travel-cleanup';
// Type-only (se borra en runtime; el módulo real se carga por import() dinámico solo con Appium).
import type { DriverCargoDeclineHarness } from '../../mobile/appium/harness/DriverCargoDeclineHarness';

export type CargoScenario = {
	client: string;
	/** Omitir cuando el cliente auto-asigna el pasajero (app pax). */
	passenger?: string;
	origin: string;
	destination: string;
	/** Precondición de tarjeta vinculada (solo happy/3ds de app pax). */
	cardPrecondition?: { apiSearchQuery: string; requiredLast4: string; tcLabel: string };
	/**
	 * Pasarela del carrier bajo prueba — selecciona la CADENA DE CREDENCIALES del dispatcher
	 * (`USER_CARRIER_<GW>_<ENV>` → `USER_CARRIER_<GW>` → `USER_CARRIER_<ENV>` → `USER_CARRIER`,
	 * ver `getDispatcher`). Omitido = default histórico `stripe` (cadena `USER_CARRIER_<ENV>` →
	 * `USER_CARRIER`, byte-idéntica al comportamiento previo a la parametrización): los 12 specs
	 * de cargo Stripe no declaran `gateway` y siguen logueando exactamente igual.
	 *
	 * NO cambia el DATO de la tarjeta — en Cargo a Bordo el cobro ocurre en la Driver App y la
	 * tarjeta llega por `CargoRunOptions.driverAppStep.charge` (ver `resolveDriverCharge`).
	 */
	gateway?: GatewayName;
};

/**
 * Especificación del cobro que ejecuta la fase Driver App (Appium) al finalizar el viaje.
 * Cuando está presente Y Appium habilitado (APPIUM=1), se corre la fase driver real:
 * recibir/aceptar viaje → finalizar → abrir modal Cargo a Bordo → fillAndSubmit(card) → assert outcome.
 */
export type DriverChargeSpec = {
	card: { number: string; expiry: string; cvc: string; holderName?: string; postal?: string };
	expectedOutcome: 'declined' | 'success';
	/** Card always-3DS: tras COBRAR completar el challenge 3DS. */
	is3ds?: boolean;
};

export type CargoRunOptions = {
	/** Timeout del poll de creación (POST /travels). Default 15_000. */
	createTimeout?: number;
	/**
	 * Asignación MANUAL directa al conductor (Send Manual → Assign → Assign) en vez de Send Service.
	 * Elimina el timer de oferta-candidato. Requerido para el e2e driver estable (ver test-5).
	 */
	manualAssign?: boolean;
	/**
	 * Paso Driver App. Sin `charge` o sin Appium (APPIUM=1) → `test.fixme` (fallback histórico).
	 * Con `charge` + APPIUM=1 → ejecuta la fase driver real vía DriverCargoDeclineHarness.
	 */
	driverAppStep?: { title: string; note?: string; charge?: DriverChargeSpec };
};

/** Flag para habilitar la fase Driver App (Appium sobre dispositivo físico). */
function isAppiumEnabled(): boolean {
	return process.env.APPIUM === '1' || process.env.RUN_DRIVER_APPIUM === 'true';
}

export class CargoABordoSteps extends UiBase {
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
	 * Login como dispatcher carrier. `gateway` selecciona la cadena de credenciales por
	 * pasarela (`USER_CARRIER_<GW>_<ENV> → … → USER_CARRIER`); omitido = default histórico
	 * (mismo criterio y misma firma que `CarrierHoldSteps.login`).
	 */
	async login(gateway?: GatewayName): Promise<void> {
		await loginAsDispatcher(this.page, gateway ? { gateway } : undefined);
	}

	/** Verifica que NO aparezca el modal 3DS (Cargo a Bordo no lo presenta en carrier web). */
	async expectNoThreeDs(): Promise<void> {
		await expectNoThreeDSModal(this.page);
	}

	/**
	 * Orquestador reusable de la fase WEB de alta de viaje con método "Cargo a Bordo".
	 * Cubre app pax / contractor / empresa; la variación de cliente/pasajero llega por
	 * `scenario`. Captura y cancela el travelId creado (cleanup) en el `finally`.
	 */
	async runCargoScenario(scenario: CargoScenario, options: CargoRunOptions = {}): Promise<void> {
		const createTimeout = options.createTimeout ?? 15_000;
		let travelIdRef: TravelIdRef | null = null;
		// Fase driver activa ⟺ Appium habilitado + card de cobro presente.
		const driverPhaseActive = isAppiumEnabled() && !!options.driverAppStep?.charge;
		let driverHarness: DriverCargoDeclineHarness | null = null;

		await test.step(scenario.gateway ? `Login carrier (creds chain ${scenario.gateway})` : 'Login carrier', async () => {
			await this.login(scenario.gateway);
		});

		if (scenario.cardPrecondition) {
			const pre = scenario.cardPrecondition;
			await test.step(`Precondición: validar tarjeta ${pre.requiredLast4} vinculada al pasajero`, async () => {
				const check = await validateCardPrecondition(this.page, {
					passengerName: pre.apiSearchQuery,
					requiredLast4: pre.requiredLast4
				});
				debugLog(
					'gateway-pg:carrier',
					`[card-precondition] ${scenario.passenger ?? scenario.client}: ${check.activeCards} tarjetas, tiene ${pre.requiredLast4}: ${check.hasRequiredCard}, limpiadas: ${check.cardsDeleted}`
				);
				if (!check.hasRequiredCard) {
					throw new Error(
						`[${pre.tcLabel}] PRECONDICIÓN NO CUMPLIDA: pasajero sin tarjeta ${pre.requiredLast4} activa (tarjetas activas: ${check.activeCards}). Vincular manualmente en TEST antes de ejecutar.`
					);
				}
			});
		}

		try {
			// PRE-WARM: abrir la sesión Appium del driver + dejarlo Disponible ANTES de crear el
			// viaje, para sacar el arranque de sesión (~10s) del camino crítico y ganarle al timer
			// de cancelación del driver-candidato. La sesión queda viva (newCommandTimeout alto)
			// esperando el request mientras corre la fase web.
			if (driverPhaseActive) {
				await test.step('[PRE-WARM] Sesión driver Appium + Disponible', async () => {
					test.setTimeout(420_000);
					const { getDriverAppConfig } = await import('../../mobile/appium/config/appiumRuntime');
					const { DriverCargoDeclineHarness } = await import(
						'../../mobile/appium/harness/DriverCargoDeclineHarness'
					);
					driverHarness = new DriverCargoDeclineHarness(getDriverAppConfig());
					await driverHarness.prewarm();
				});
			}

			travelIdRef = await captureCreatedTravelId(this.page);

			await test.step('Ir al formulario de nuevo viaje', async () => {
				await this.dashboard.openNewTravel();
				await this.travel.ensureLoaded();
			});

			await test.step(
				options.manualAssign
					? 'Completar formulario — VIAJE PLANO (sin método; para Send Manual)'
					: 'Completar formulario — método Cargo a Bordo',
				async () => {
					const formInput = {
						client: scenario.client,
						passenger: scenario.passenger,
						origin: scenario.origin,
						destination: scenario.destination
					};
					// Asignación manual (Send Manual → Assign) REQUIERE viaje plano: seleccionar "Cargo a
					// Bordo" oculta "Send Manual". El conductor elige tarjeta (CREDIT_CARD) en el Resumen.
					if (options.manualAssign) {
						await this.travel.fillPlain(formInput);
					} else {
						await this.travel.fillCargoABordo(formInput);
					}
				}
			);

			await test.step(
				options.manualAssign
					? 'Seleccionar vehículo y ASIGNAR (Send Manual → Assign)'
					: 'Seleccionar vehículo y enviar el viaje',
				async () => {
					await this.travel.clickSelectVehicle();
					if (options.manualAssign) {
						await this.travel.clickSendManualAndAssign();
					} else {
						await this.travel.clickSendService();
					}
				}
			);

			await test.step('Verificar que no aparece modal 3DS', async () => {
				await this.expectNoThreeDs();
			});

			await test.step('Confirmar creación del viaje via network interception', async () => {
				// Cargo a Bordo post-submit puede quedarse en /travel/create?limitExceeded=false
				// como comportamiento normal. Fuente de verdad: POST /travels interceptado.
				await expect
					.poll(() => travelIdRef?.travelId, {
						timeout: createTimeout,
						message: '[Cargo a Bordo] POST /travels no capturó travelId tras el submit'
					})
					.not.toBeNull();
			});

			// Con la fase driver ACTIVA (APPIUM + charge) hay un conductor online real (pre-warm)
			// que consume el despacho: el viaje puede salir de "Buscando chofer" (asignado/aceptado)
			// antes de esta aserción. El alta ya quedó confirmada por el POST /travels interceptado.
			// ⇒ NO hacemos hard-fail aquí en ese modo. En runs web-only la aserción estricta se mantiene.
			await test.step('Validar estado del viaje — Buscando chofer en gestión', async () => {
				if (driverPhaseActive) {
					debugLog(
						'gateway-pg:carrier',
						'[cargo] fase driver activa: se omite la aserción estricta "Buscando chofer" (un conductor online consume el despacho; alta ya confirmada por POST /travels).'
					);
					return;
				}
				await this.management.goto();
				await this.management.expectPassengerInPorAsignar(
					scenario.passenger ?? scenario.client,
					undefined,
					'Buscando chofer'
				);
			});

			if (options.driverAppStep) {
				const step = options.driverAppStep;
				await test.step(step.title, async () => {
					// Fallback histórico: sin fase driver activa (sin Appium o sin card) → fixme (web ya validado).
					if (!driverPhaseActive || !driverHarness || !step.charge) {
						test.fixme(
							true,
							step.note ?? 'PENDIENTE: fase Driver App — requiere Appium (APPIUM=1) + charge card.'
						);
						return;
					}

					// Sesión driver YA pre-warm: reaccionar al request entrante y cobrar INMEDIATO.
					const result = await driverHarness.reactAndCharge(step.charge.card, {
						expect3ds: step.charge.is3ds
					});
					const reason = 'reason' in result.outcome ? result.outcome.reason : '';
					debugLog(
						'gateway-pg:driver',
						`[driver-app] outcome=${result.outcome.status} reason="${reason}" reachedModal=${result.reachedPaymentModal}`
					);

					// Debería alcanzar el modal de cobro Cargo a Bordo (Stripe Elements) en la Driver App.
					expect(result.reachedPaymentModal, 'Debería abrir el modal de cobro en la Driver App').toBe(true);
					// Debería rechazar el cobro con la tarjeta declinada (outcome esperado).
					expect(result.outcome.status, 'Debería rechazar el cobro con la tarjeta declinada').toBe(
						step.charge.expectedOutcome
					);
				});
			}
		} finally {
			if (driverHarness) {
				await test.step('Cerrar sesión driver Appium', async () => {
					await driverHarness!.endSession().catch(() => undefined);
				});
			}
			if (travelIdRef) {
				await test.step('Cleanup: cancelar viaje creado', async () => {
					await cancelTravelIfCreated(this.page, travelIdRef!);
				});
			}
		}
	}
}
