/**
 * KATA Steps (orquestador de flujo) — Contractor · Alta de Viaje con Hold (colaborador).
 *
 * Extrae el orquestador compartido de los specs de hold contractor (colaborador con y
 * sin 3DS). El flujo contractor difiere del carrier (`CarrierHoldSteps`): campo único
 * de usuario, el estado del hold es una precondición externa (portal carrier) NO
 * togglada en el test, y el alta redirige a /dashboard (no a /travels/xxx) — por eso
 * es un Step propio y no una variante de `runHoldScenario`.
 *
 * Convención KATA aplicada:
 *   - Extiende UiBase (usa `this.page`); instancia las Page components internamente.
 *   - Import por alias (@ui, @features, @TestFixture) — sin relativos nuevos.
 *   - `runColaboradorScenario` orquesta; los pasos atómicos (login, 3DS) se exponen.
 *
 * NOTA @atc — los ATC viven en las Page components (fillMinimum → MG-148,
 * selectSavedCard → MG-482, 3DS → MG-152); este Step orquesta, no mapea TCs directamente.
 */

import type { TestContextOptions } from '@TestContext';

import { test, expect } from '@TestFixture';
import { UiBase } from '@ui/UiBase';
import { ThreeDsChallengePage } from '@ui/ThreeDsChallengePage';
import { CarrierDashboardPage } from '@ui/carrier';
import { ContractorNewTravelPage } from '@ui/contractor';
import { expectNoThreeDSModal, loginAsContractor } from '@features/gateway-pg/fixtures/gateway.fixtures';
import {
	captureCreatedTravelId,
	cancelTravelIfCreated,
	type TravelIdRef
} from '@features/gateway-pg/helpers/travel-cleanup';

/** Flujo de tarjeta: nueva vinculación por last4, o tarjeta guardada del colaborador. */
export type ContractorCardFlow = { kind: 'new'; last4: string } | { kind: 'saved' };

/**
 * Modo de 3DS del escenario:
 *  - 'none': flujo sin 3DS → verifica que NO aparezca el modal.
 *  - 'link-then-service': challenge obligatorio tras completar la tarjeta (vinculación)
 *    + un challenge opcional post-envío (confirmación del servicio).
 *  - 'post-service-double': hasta 2 challenges opcionales post-envío.
 */
export type ContractorThreeDsMode = 'none' | 'link-then-service' | 'post-service-double';

export type ContractorHoldScenario = {
	/** Colaborador (campo único usuario/pasajero en contractor). */
	user: string;
	origin: string;
	destination: string;
	card: ContractorCardFlow;
	threeDs: ContractorThreeDsMode;
};

export class ContractorHoldSteps extends UiBase {
	readonly dashboard: CarrierDashboardPage;
	readonly travel: ContractorNewTravelPage;
	readonly threeDs: ThreeDsChallengePage;

	constructor(options: TestContextOptions) {
		super(options);
		const opts = { page: this.page };
		this.dashboard = new CarrierDashboardPage(opts);
		this.travel = new ContractorNewTravelPage(opts);
		this.threeDs = new ThreeDsChallengePage(opts);
	}

	/** Login como contractor. */
	async login(): Promise<void> {
		await loginAsContractor(this.page);
	}

	/** Aprueba el challenge 3DS si aparece (wait corto no-bloqueante). */
	async approve3dsIfPresent(timeout = 5_000): Promise<void> {
		if (await this.threeDs.waitForOptionalVisible(timeout)) {
			await this.threeDs.completeSuccess();
			await this.threeDs.waitForHidden();
		}
	}

	/** Verifica que NO aparezca el modal 3DS. */
	async expectNoThreeDs(): Promise<void> {
		await expectNoThreeDSModal(this.page);
	}

	/**
	 * Orquestador reusable de alta de viaje contractor con colaborador. Cubre tarjeta
	 * nueva/guardada × 3DS/no-3DS. El estado del hold (ON/OFF) es precondición externa
	 * del portal carrier — este flujo no lo toggla.
	 */
	async runColaboradorScenario(scenario: ContractorHoldScenario): Promise<void> {
		let travelIdRef: TravelIdRef | null = null;

		await test.step('Login contractor', async () => {
			await this.login();
		});

		try {
			travelIdRef = await captureCreatedTravelId(this.page);

			await test.step('Ir al formulario de nuevo viaje', async () => {
				await this.dashboard.openNewTravel();
				await this.travel.ensureLoaded();
			});

			if (scenario.card.kind === 'new') {
				const cardLast4 = scenario.card.last4;
				await test.step(`Completar formulario — colaborador + tarjeta ${scenario.threeDs === 'none' ? 'sin 3DS' : 'con 3DS'}`, async () => {
					await this.travel.fillMinimum({
						client: scenario.user,
						passenger: scenario.user,
						origin: scenario.origin,
						destination: scenario.destination,
						cardLast4
					});
				});
			} else {
				await test.step('Seleccionar colaborador, origen y destino', async () => {
					await this.travel.selectClient(scenario.user);
					await this.travel.setOrigin(scenario.origin);
					await this.travel.setDestination(scenario.destination);
				});

				await test.step('Seleccionar tarjeta VISA guardada del colaborador', async () => {
					const hasCard = await this.travel.hasHighlightedSavedCard();
					test.skip(
						!hasCard,
						'Precondición: colaborador no tiene tarjeta guardada en TEST. Vincular tarjeta primero.'
					);
					await this.travel.selectSavedCard();
				});
			}

			if (scenario.threeDs === 'link-then-service') {
				await test.step('Completar primer challenge 3DS — validación del hold (vinculación)', async () => {
					await this.threeDs.waitForVisible();
					await this.threeDs.completeSuccess();
					await this.threeDs.waitForHidden();
				});
			}

			await test.step('Seleccionar vehículo y enviar el viaje', async () => {
				await this.travel.waitForVehicleSelectionReady();
				await this.travel.clickSelectVehicle();
				await this.travel.clickSendService();
			});

			if (scenario.threeDs === 'link-then-service') {
				await test.step('Completar segundo challenge 3DS si aparece (confirmación del servicio)', async () => {
					await this.approve3dsIfPresent(5_000);
				});
			} else if (scenario.threeDs === 'post-service-double') {
				await test.step('Completar hasta 2 challenges 3DS opcionales', async () => {
					await this.approve3dsIfPresent(10_000);
					await this.approve3dsIfPresent(5_000);
				});
			} else {
				await test.step('Verificar que no aparece modal 3DS', async () => {
					await this.expectNoThreeDs();
				});
			}

			await test.step('Esperar redirección fuera del formulario de alta', async () => {
				// El portal contractor redirige a /dashboard tras crear el viaje (no a /travels/xxx).
				await this.page.waitForURL(url => !url.href.includes('/travel/create'), {
					timeout: 30_000,
					waitUntil: 'commit'
				});
			});

			// Validación API: el POST /travels devolvió un travelId — viaje creado en backend.
			expect(travelIdRef?.travelId, 'POST /travels debe haber capturado un travelId').not.toBeNull();
		} finally {
			if (travelIdRef) {
				await test.step('Cleanup: cancelar viaje creado', async () => {
					await cancelTravelIfCreated(this.page, travelIdRef!);
				});
			}
		}
	}
}
