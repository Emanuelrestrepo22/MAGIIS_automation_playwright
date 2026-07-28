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
import type { GatewayName } from '@fixtures/gateways/_shared';

import { test, expect } from '@TestFixture';
import { UiBase } from '@ui/UiBase';
import { ThreeDsChallengePage } from '@ui/ThreeDsChallengePage';
import { CarrierDashboardPage } from '@ui/carrier';
import { cardFormFor } from '@ui/carrier/card-forms';
import { ContractorNewTravelPage } from '@ui/contractor';
import { resolveCard } from '@fixtures/gateways/_shared';
import { expectNoThreeDSModal, loginAsContractor } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { getGatewayPgAdapter } from '@features/gateway-pg/helpers/adapters';
import { validateAndSelectMercadoPagoCard } from '@features/gateway-pg/helpers/mercadoPago.helpers';
import {
	captureCreatedTravelId,
	cancelTravelIfCreated,
	type TravelIdRef
} from '@features/gateway-pg/helpers/travel-cleanup';

/**
 * Flujo de tarjeta: nueva vinculación (last4 requerido SOLO en stripe — las demás
 * pasarelas resuelven la tarjeta vía `resolveCard({gateway,intent:'HAPPY_NO_AUTH'})`),
 * o tarjeta guardada del colaborador.
 */
export type ContractorCardFlow = { kind: 'new'; last4?: string } | { kind: 'saved' };

/**
 * Modo de 3DS del escenario:
 *  - 'none': flujo sin 3DS → verifica que NO aparezca el modal.
 *  - 'link-then-service': challenge obligatorio tras completar la tarjeta (vinculación)
 *    + un challenge opcional post-envío (confirmación del servicio).
 *  - 'post-service-double': hasta 2 challenges opcionales post-envío.
 */
export type ContractorThreeDsMode = 'none' | 'link-then-service' | 'post-service-double';

export type ContractorHoldScenario = {
	/**
	 * Pasarela del journey (S7). Default 'stripe' (comportamiento histórico intacto).
	 * No-stripe: login contractor con creds por pasarela y tarjeta vía la CardFormStrategy
	 * del adapter (form nativo Angular). 3DS es EXCLUSIVO Stripe → usar threeDs: 'none'.
	 */
	gateway?: GatewayName;
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

	/**
	 * Login como contractor. `gateway` selecciona la cadena de credenciales por pasarela
	 * (`getContractorCollaborator(gateway)`); omitido = default histórico.
	 */
	async login(gateway?: GatewayName): Promise<void> {
		await loginAsContractor(this.page, gateway ? { gateway } : undefined);
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
		const gateway: GatewayName = scenario.gateway ?? 'stripe';
		// Fail-fast doctrina 3DS (post-review A5): 3DS es EXCLUSIVO de Stripe. Un
		// threeDs-mode con un adapter sin 3DS colgaba el flujo esperando un modal que
		// nunca aparece (waitForVisible) — error de invocación, lanzar claro y temprano.
		if (scenario.threeDs !== 'none' && !getGatewayPgAdapter(gateway).requires3ds) {
			throw new Error(
				`runColaboradorScenario: threeDs='${scenario.threeDs}' con gateway '${gateway}' (requires3ds=false) — ` +
					`3DS es EXCLUSIVO de Stripe; usar threeDs: 'none' para ${gateway} (doctrina: caso excluido, no convertido).`
			);
		}
		let travelIdRef: TravelIdRef | null = null;

		await test.step('Login contractor', async () => {
			await this.login(scenario.gateway);
		});

		try {
			travelIdRef = await captureCreatedTravelId(this.page);

			await test.step('Ir al formulario de nuevo viaje', async () => {
				await this.dashboard.openNewTravel();
				await this.travel.ensureLoaded();
			});

			if (scenario.card.kind === 'new' && gateway !== 'stripe') {
				// No-stripe (S7): journey contractor hasta el pago + método Preautorizada +
				// estrategia de card form del adapter (form nativo Angular) + validación por pasarela.
				await test.step(`Completar formulario — colaborador + tarjeta ${gateway} (form nativo)`, async () => {
					await this.travel.fillJourneyUntilPayment({
						client: scenario.user,
						origin: scenario.origin,
						destination: scenario.destination
					});
					await this.travel.selectPaymentMethod('Preautorizada');
					const card = resolveCard({ gateway, intent: 'HAPPY_NO_AUTH' });
					await cardFormFor(gateway).fill(this.page, card);
					if (gateway === 'mercado-pago') {
						const mpLink = await validateAndSelectMercadoPagoCard(this.page);
						// Guard future-proof (hoy INERTE): 'validation-failed' está RESERVADO a evidencia
						// live (UAT) de un fallo distinguible de la limitación sandbox — hoy ningún camino
						// lo retorna en TEST (el error explícito es la manifestación documentada → skip).
						expect(mpLink, 'MP: señal de fallo real de validación distinguible de la limitación sandbox (evidencia live)').not.toBe('validation-failed');
						test.skip(
							mpLink !== 'linked',
							'MP: validación de tarjeta no completa en TEST (sandbox MP no transacciona) — UAT-only. Form-fill + habilitación de "Validar" verificados.'
						);
					} else {
						await this.travel.validateNativeCard();
					}
				});
			} else if (scenario.card.kind === 'new') {
				const cardLast4 = scenario.card.last4;
				if (!cardLast4) {
					throw new Error(
						"runColaboradorScenario: card.last4 es requerido en el flujo stripe (card kind 'new')."
					);
				}
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
				// Oráculo explícito de destino (restaurado del original c3c99e8 — auditoría R2):
				// "salió de /travel/create" NO asserta que llegó al dashboard; el redirect de
				// éxito del contractor es /contractor/dashboard (MP-NOHOLD-04, smoke-cases-no3ds).
				await expect(this.page).toHaveURL(/contractor\/dashboard/, { timeout: 10_000 });
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
