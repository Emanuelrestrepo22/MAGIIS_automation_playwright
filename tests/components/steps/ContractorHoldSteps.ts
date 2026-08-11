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
 * NOTA @atc — los ATC viven en las Page components (fillMinimum → MG-148, 3DS → MG-152);
 * este Step orquesta, no mapea TCs directamente. `selectSavedCard` ya no lleva key: la que
 * tenía (MG-482) es el TC de validaciones de formulario de tarjeta, que no ejercita.
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
import { cleanupGatewayCardByLast4, extractAuthToken } from '@features/gateway-pg/helpers/card-precondition';
import { debugLog } from '@helpers/index';

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

	/**
	 * Aprueba el challenge 3DS si aparece (wait corto no-bloqueante).
	 *
	 * `settled` (fix 2026-08-07, diagnóstico live TC006 en serial tras TC005): forwarding directo
	 * a `waitForOptionalVisible` — sin esto, un check "post-envío" que corre mientras el portal YA
	 * está redirigiendo (tarjetas que solo desafían una vez, en la vinculación) puede leer el
	 * overlay como "visible" en una ventana intermedia y comprometerse a `completeSuccess()`, que
	 * falla 60s después con "elemento no encontrado" porque la página ya navegó (evidencia:
	 * error-context.md del fallo sin NINGÚN rastro de iframe/challenge — la página ya no era
	 * travel/create). Con `settled`, el wait corta apenas el flujo avanzó, en vez de agotar el
	 * timeout a ciegas contra un challenge que nunca iba a aparecer.
	 */
	async approve3dsIfPresent(timeout = 5_000, settled?: () => Promise<boolean>): Promise<void> {
		if (await this.threeDs.waitForOptionalVisible(timeout, settled)) {
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
						await this.travel.validateNativeCard(card.last4);
					}
				});
			} else if (scenario.card.kind === 'new') {
				const cardLast4 = scenario.card.last4;
				if (!cardLast4) {
					throw new Error(
						"runColaboradorScenario: card.last4 es requerido en el flujo stripe (card kind 'new')."
					);
				}
				// Precondición de idempotencia (fix 2026-08-07, mismo root cause que CarrierHoldSteps
				// 18058c7): confirmado en vivo — TC002/TC006 (2.º test de su archivo serial) fallan
				// porque TC001/TC005 (1.º) ya vinculó la MISMA tarjeta al colaborador; el alta
				// diverge a tarjeta-guardada ("Button did not become enabled" / rechazo de
				// validación). Se ubica DESPUÉS de abrir el formulario (no antes): un intento previo
				// con el cleanup antes de openNewTravel() disparó timeouts de navegación intermitentes
				// en el SPA de contractor (root cause distinto al de carrier, no reproducido acá).
				await test.step('Precondición: limpiar tarjeta previa del colaborador (idempotencia)', async () => {
					let token: string | null = null;
					for (let attempt = 0; attempt < 3 && !token; attempt++) {
						token = await extractAuthToken(this.page);
					}
					if (!token) {
						debugLog('gateway-pg:contractor', '[card-cleanup] JWT no capturado tras 3 intentos — cleanup correrá sin auth y no-op');
					}
					// `scenario.user` viene en formato "apellido, nombre" (convención del dropdown,
					// ver tests/fixtures/users/passengers.ts) — el endpoint de búsqueda resuelve por
					// lastName; se agrega el fragmento apellido como fallback (mismo patrón que
					// CarrierHoldSteps con paxSearchQueries) por si el string completo no matchea.
					const lastNameFragment = scenario.user.split(',')[0].trim();
					const queries = lastNameFragment === scenario.user ? [scenario.user] : [scenario.user, lastNameFragment];
					await cleanupGatewayCardByLast4(this.page, queries, cardLast4);
				});
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
			} else if (scenario.threeDs === 'post-service-double') {
				// Fix 2026-08-07 (diagnóstico live TC006): tarjetas `alwaysAuthenticate` desafían
				// SIEMPRE en la validación de vinculación, sin importar Hold ON/OFF — el modo
				// 'post-service-double' asumía (incorrecto) que con Hold OFF ese challenge de
				// vinculación no ocurre. `fillMinimum` (NewTravelPageBase, hardened esta sesión)
				// trata "challenge visible" como éxito DE LA VALIDACIÓN y retorna sin resolverlo —
				// el caller SIEMPRE debe estar preparado a resolverlo. Evidencia: screenshot con
				// el modal "3D Secure 2 Test Page" abierto y bloqueando "Seleccionar Vehículo".
				await test.step('Completar challenge 3DS de vinculación si aparece (post-service-double)', async () => {
					await this.approve3dsIfPresent(10_000);
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
					// `settled`: el portal contractor puede redirigir a /dashboard sin más challenge
					// (tarjetas que ya autenticaron en la vinculación) — cortar el wait en cuanto eso
					// ocurra evita comprometerse a `completeSuccess()` contra un overlay que ya no está.
					const alreadyRedirected = async () => !this.page.url().includes('/travel/create');
					await this.approve3dsIfPresent(10_000, alreadyRedirected);
					await this.approve3dsIfPresent(5_000, alreadyRedirected);
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
			//
			// ROOT CAUSE (diagnóstico live 2026-08-07, TC001/TC002/TC006): el redirect a
			// /contractor/dashboard es MÁS RÁPIDO que el parseo async de `captureCreatedTravelId`
			// (page.on('response') + response.json()) — race confirmada con logs con timestamp:
			// el assert síncrono corría y fallaba ANTES de que el handler completara su propio
			// `[travel-cleanup] Capturado travelId=...`. El portal carrier no lo sufre (navega a
			// /travels/{id}, con más pasos/settle antes del assert); contractor redirige a
			// /dashboard de inmediato. `expect.poll` espera la señal async real (sin timeout
			// ciego — mismo patrón ya establecido en tests/helpers/assertions.ts).
			await expect
				.poll(() => travelIdRef?.travelId ?? null, {
					message: 'POST /travels debe haber capturado un travelId',
					timeout: 10_000
				})
				.not.toBeNull();
		} finally {
			if (travelIdRef) {
				await test.step('Cleanup: cancelar viaje creado', async () => {
					await cancelTravelIfCreated(this.page, travelIdRef!);
				});
			}
		}
	}
}
