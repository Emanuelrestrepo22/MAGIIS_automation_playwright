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
 * NOTA @atc — los ATC mapeados a MG viven en las Page components; este Step orquesta,
 * no mapea TCs directamente. MG-161 (área F cobro) / MG-158 (área E hold), ambos
 * mapeo por área aceptado (idmap API-level, sin 1:1 con TS-STRIPE-TC10xx UI).
 */

import type { TestContextOptions } from '@TestContext';

import { test, expect } from '@TestFixture';
import { UiBase } from '@ui/UiBase';
import { CarrierDashboardPage, CarrierNewTravelPage, CarrierTravelManagementPage } from '@ui/carrier';
import { debugLog } from '@helpers/index';
import { expectNoThreeDSModal, loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { validateCardPrecondition } from '@features/gateway-pg/helpers/card-precondition';
import { captureCreatedTravelId, cancelTravelIfCreated, type TravelIdRef } from '@features/gateway-pg/helpers/travel-cleanup';

export type CargoScenario = {
	client: string;
	/** Omitir cuando el cliente auto-asigna el pasajero (app pax). */
	passenger?: string;
	origin: string;
	destination: string;
	/** Precondición de tarjeta vinculada (solo happy/3ds de app pax). */
	cardPrecondition?: { apiSearchQuery: string; requiredLast4: string; tcLabel: string };
};

export type CargoRunOptions = {
	/** Timeout del poll de creación (POST /travels). Default 15_000. */
	createTimeout?: number;
	/** Paso Driver App (Appium pendiente) — se renderiza como `test.fixme`. */
	driverAppStep?: { title: string; note?: string };
};

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

	/** Login como dispatcher carrier. */
	async login(): Promise<void> {
		await loginAsDispatcher(this.page);
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

		await test.step('Login carrier', async () => {
			await this.login();
		});

		if (scenario.cardPrecondition) {
			const pre = scenario.cardPrecondition;
			await test.step(`Precondición: validar tarjeta ${pre.requiredLast4} vinculada al pasajero`, async () => {
				const check = await validateCardPrecondition(this.page, {
					passengerName: pre.apiSearchQuery,
					requiredLast4: pre.requiredLast4,
				});
				debugLog('gateway-pg:carrier', `[card-precondition] ${scenario.passenger ?? scenario.client}: ${check.activeCards} tarjetas, tiene ${pre.requiredLast4}: ${check.hasRequiredCard}, limpiadas: ${check.cardsDeleted}`);
				if (!check.hasRequiredCard) {
					throw new Error(
						`[${pre.tcLabel}] PRECONDICIÓN NO CUMPLIDA: pasajero sin tarjeta ${pre.requiredLast4} activa (tarjetas activas: ${check.activeCards}). Vincular manualmente en TEST antes de ejecutar.`,
					);
				}
			});
		}

		try {
			travelIdRef = await captureCreatedTravelId(this.page);

			await test.step('Ir al formulario de nuevo viaje', async () => {
				await this.dashboard.openNewTravel();
				await this.travel.ensureLoaded();
			});

			await test.step('Completar formulario — método Cargo a Bordo', async () => {
				await this.travel.fillCargoABordo({
					client: scenario.client,
					passenger: scenario.passenger,
					origin: scenario.origin,
					destination: scenario.destination,
				});
			});

			await test.step('Seleccionar vehículo y enviar el viaje', async () => {
				await this.travel.clickSelectVehicle();
				await this.travel.clickSendService();
			});

			await test.step('Verificar que no aparece modal 3DS', async () => {
				await this.expectNoThreeDs();
			});

			await test.step('Confirmar creación del viaje via network interception', async () => {
				// Cargo a Bordo post-submit puede quedarse en /travel/create?limitExceeded=false
				// como comportamiento normal. Fuente de verdad: POST /travels interceptado.
				await expect
					.poll(() => travelIdRef?.travelId, {
						timeout: createTimeout,
						message: '[Cargo a Bordo] POST /travels no capturó travelId tras el submit',
					})
					.not.toBeNull();
			});

			await test.step('Validar estado del viaje — Buscando chofer en gestión', async () => {
				await this.management.goto();
				await this.management.expectPassengerInPorAsignar(scenario.passenger ?? scenario.client, undefined, 'Buscando chofer');
			});

			if (options.driverAppStep) {
				await test.step(options.driverAppStep.title, async () => {
					test.fixme(true, options.driverAppStep!.note ?? 'PENDIENTE: fase Driver App — requiere Appium.');
				});
			}
		} finally {
			if (travelIdRef) {
				await test.step('Cleanup: cancelar viaje creado', async () => {
					await cancelTravelIfCreated(this.page, travelIdRef!);
				});
			}
		}
	}
}
