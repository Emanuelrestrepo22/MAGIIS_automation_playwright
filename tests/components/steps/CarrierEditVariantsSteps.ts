/**
 * KATA Steps (orquestador de flujo) — Carrier · Variantes de Edición de Viaje (Operaciones).
 *
 * Cubre las variantes de:
 *   - Edición de viajes PROGRAMADOS (TS-STRIPE-P2-TC079..083) — el caso ancla TC078 conserva su
 *     flujo original en `CarrierTravelEditSteps.runScheduledTripCardEdit` (read-only). Estas
 *     variantes SE AUTOSEEDEAN: alta de viaje programado (horario futuro) y edición del método
 *     de pago sobre ESE viaje (deep-link por travelId — sin depender de la primera fila).
 *   - Edición de viajes EN CONFLICTO (TS-STRIPE-P2-TC084/086/088) — precondición vía
 *     `RecoverySteps.setupFailedThreeDs` (viaje NO_AUTORIZADO por challenge 3DS rechazado).
 *
 * Ingeniería inversa del FE (`travel-dashboard.component.toggleEditButton`): el lápiz de edición
 * se publica para SEARCHING_DRIVER / SCHEDULED / **NO_AUTH** (origen Web) y navega a
 * `travel/detail?travelId=<id>&mode=3` (ABMModes.Edit = 3) — la MISMA superficie de edición que
 * consume el ancla TC078, por eso ambos specs comparten este orquestador.
 *
 * Convención KATA: extiende UiBase; instancia Page components internamente; imports por alias.
 * NOTA @atc: los ATC viven en las Page components (linkAndValidatePreauthorizedCard → MG-415,
 * confirmLinkedCardAndSave → MG-416, 3DS → MG-152/153); este Step orquesta.
 */

import type { TestContextOptions } from '@TestContext';

import { test, expect } from '@TestFixture';
import { UiBase } from '@ui/UiBase';
import { ThreeDsChallengePage } from '@ui/ThreeDsChallengePage';
import {
	CarrierDashboardPage,
	CarrierNewTravelPage,
	CarrierTravelDetailPage
} from '@ui/carrier';
import { RecoverySteps, type RecoveryScenario } from './RecoverySteps';
import { debugLog } from '@helpers/index';
import { getPortalUrl } from '@config/gatewayPortalRuntime';
import {
	expectNoThreeDSModal,
	loginAsDispatcher,
	STRIPE_TEST_CARDS
} from '@features/gateway-pg/fixtures/gateway.fixtures';
import { setHoldViaApi, getCarrierParameters, readHoldRaw } from '@features/gateway-pg/helpers/parameters-api';
import {
	extractAuthToken,
	cleanupGatewayCardByLast4,
	validateCardPrecondition
} from '@features/gateway-pg/helpers/card-precondition';
import {
	captureCreatedTravelId,
	cancelTravel,
	cancelTravelIfCreated,
	type TravelIdRef
} from '@features/gateway-pg/helpers/travel-cleanup';
import { waitForTravelCreation } from '@features/gateway-pg/helpers/stripe.helpers';

/** URL del ABM de edición (mode=3) — mismo patrón que valida el ancla TC078. */
const EDIT_DETAIL_URL = /\/home\/carrier\/travel\/detail\?travelId=\d+&mode=3/;

export type EditSeedScenario = {
	client: string;
	passenger: string;
	origin: string;
	destination: string;
	/** Query API para la precondición/limpieza de tarjeta del pasajero. */
	apiSearchQuery?: string;
};

/**
 * Variante de edición del método de pago:
 *   - 'link-new-card'  → vincula tarjeta NUEVA sin 3DS (mastercardDebit) y guarda.
 *   - 'select-existing'→ selecciona una tarjeta YA vinculada (4242) y guarda.
 *   - 'link-new-3ds'   → vincula tarjeta NUEVA con challenge 3DS aprobado y guarda.
 */
export type EditCardVariant = 'link-new-card' | 'select-existing' | 'link-new-3ds';

export type ScheduledEditOptions = {
	/** Estado del hold del carrier durante el alta programada Y la edición. */
	hold: 'on' | 'off';
	variant: EditCardVariant;
};

export class CarrierEditVariantsSteps extends UiBase {
	readonly dashboard: CarrierDashboardPage;
	readonly travel: CarrierNewTravelPage;
	readonly detail: CarrierTravelDetailPage;
	readonly threeDs: ThreeDsChallengePage;

	constructor(options: TestContextOptions) {
		super(options);
		const opts = { page: this.page };
		this.dashboard = new CarrierDashboardPage(opts);
		this.travel = new CarrierNewTravelPage(opts);
		this.detail = new CarrierTravelDetailPage(opts);
		this.threeDs = new ThreeDsChallengePage(opts);
	}

	/** Fija el hold por API con read-back CRUDO (misma disciplina que CarrierHoldSteps). */
	private async setHold(state: 'on' | 'off'): Promise<void> {
		await setHoldViaApi(this.page, state === 'on');
		if (state === 'on') {
			const persisted = await getCarrierParameters(this.page);
			expect(persisted.enableCreditCardHold, 'read-back API: enableCreditCardHold debe quedar true tras el POST').toBe(true);
		} else {
			expect(await readHoldRaw(this.page), 'read-back API: enableCreditCardHold debe quedar false tras el POST').toBe(false);
		}
	}

	/** Limpieza de idempotencia de tarjeta (BL-050: mismo número ya vinculado bloquea "Validar"). */
	private async cleanupPaxCard(scenario: EditSeedScenario, cardLast4: string): Promise<void> {
		// Warm-up del JWT (patrón retry ×3 — ver runHoldScenario).
		let token: string | null = null;
		for (let attempt = 0; attempt < 3 && !token; attempt++) {
			token = await extractAuthToken(this.page);
		}
		if (!token) {
			debugLog('gateway-pg:edit', '[card-cleanup] JWT no capturado tras 3 intentos — cleanup correrá sin auth y no-op');
		}
		const queries = [scenario.passenger, ...(scenario.apiSearchQuery ? [scenario.apiSearchQuery] : [])];
		await cleanupGatewayCardByLast4(this.page, queries, cardLast4);
	}

	/**
	 * SEED: alta de viaje PROGRAMADO (horario futuro del mismo día) con tarjeta preautorizada
	 * 4242 vinculada nueva. Devuelve el ref con el travelId capturado (para el deep-link de
	 * edición y el cleanup del caller). NO verifica "Por Asignar": un viaje programado vive en
	 * la pestaña Programados — el oráculo del alta es el travelId + la URL post-submit.
	 */
	private async seedScheduledTrip(scenario: EditSeedScenario): Promise<TravelIdRef> {
		const cardLast4 = STRIPE_TEST_CARDS.successDirect.slice(-4);

		await test.step('Seed: limpiar tarjeta previa del pax (idempotencia card-new)', async () => {
			await this.cleanupPaxCard(scenario, cardLast4);
		});

		const travelIdRef = await captureCreatedTravelId(this.page);

		await test.step('Seed: alta de viaje PROGRAMADO con tarjeta preautorizada 4242', async () => {
			await this.dashboard.openNewTravel();
			await this.travel.ensureLoaded();
			await this.travel.fillMinimum({
				client: scenario.client,
				passenger: scenario.passenger,
				origin: scenario.origin,
				destination: scenario.destination,
				cardLast4
			});
			const slot = await this.travel.schedulePickupAtLastSlot();
			debugLog('gateway-pg:edit', `[seed] viaje programado para las ${slot}`);
			await this.travel.clickSelectVehicle();
			await this.travel.clickSendService();
			await expectNoThreeDSModal(this.page);
			await waitForTravelCreation(this.page);
		});

		expect(travelIdRef.travelId, 'POST /travels debe haber capturado el travelId del viaje programado').not.toBeNull();
		return travelIdRef;
	}

	/**
	 * Abre el ABM de edición del viaje por deep-link (`travel/detail?travelId=<id>&mode=3`) —
	 * misma navegación que ejecuta el lápiz del dashboard (`goToTravelEdition`). Determinista:
	 * no depende del orden de la grilla. TODO(live): validar el deep-link directo (el ancla
	 * TC078 llega por click en la grilla; la ruta es la misma).
	 */
	private async openEditForTravel(travelId: number | string): Promise<void> {
		await this.page.goto(`${getPortalUrl('carrier')}/#/home/carrier/travel/detail?travelId=${travelId}&mode=3`);
		await expect(this.page).toHaveURL(EDIT_DETAIL_URL, { timeout: 15_000 });
	}

	/** Edición según la variante + guardado. El caller ya está en el ABM de edición (mode=3). */
	private async editPaymentCardPerVariant(
		scenario: EditSeedScenario,
		variant: EditCardVariant,
		opts: { threeDsCard?: string } = {}
	): Promise<void> {
		if (variant === 'link-new-card') {
			const card = STRIPE_TEST_CARDS.mastercardDebit;
			await test.step('Editar: limpiar tarjeta débito previa del pax (idempotencia BL-050)', async () => {
				await this.cleanupPaxCard(scenario, card.slice(-4));
			});
			await test.step('Editar: vincular tarjeta débito nueva sin 3DS y guardar', async () => {
				await this.detail.linkAndValidatePreauthorizedCard(card);
				await expectNoThreeDSModal(this.page);
				await this.detail.confirmLinkedCardAndSave(/Tarjeta de cr[eé]dito MASTERCARD/i);
			});
			return;
		}

		if (variant === 'select-existing') {
			const last4 = STRIPE_TEST_CARDS.successDirect.slice(-4);
			await test.step('Editar: seleccionar tarjeta vinculada existente (4242) y guardar', async () => {
				await this.detail.confirmLinkedCardAndSave(new RegExp(`\\*{3}\\s*${last4}`, 'i'));
			});
			return;
		}

		// link-new-3ds
		const card = opts.threeDsCard ?? STRIPE_TEST_CARDS.threeDSRequired;
		const last4 = card.slice(-4);
		await test.step('Editar: limpiar tarjeta 3DS previa del pax (idempotencia BL-050)', async () => {
			await this.cleanupPaxCard(scenario, last4);
		});
		await test.step('Editar: vincular tarjeta nueva con challenge 3DS aprobado y guardar', async () => {
			await this.detail.linkAndValidatePreauthorizedCard(card);
			await this.threeDs.waitForVisible();
			await this.threeDs.completeSuccess();
			await this.threeDs.waitForHidden();
			await this.detail.confirmLinkedCardAndSave(new RegExp(`\\*{3}\\s*${last4}`, 'i'));
		});
	}

	/**
	 * Orquestador de las variantes de EDICIÓN DE VIAJE PROGRAMADO (TC079..083).
	 * Self-contained: login → hold → alta programada 4242 → edición por deep-link → variante →
	 * verificación (permanece en el ABM de edición, mismo oráculo que el ancla TC078) →
	 * cleanup (cancela el viaje programado; restaura hold=ON si la variante lo apagó).
	 */
	async runScheduledEditScenario(scenario: EditSeedScenario, options: ScheduledEditOptions): Promise<void> {
		let travelIdRef: TravelIdRef | null = null;

		await test.step('Login carrier', async () => {
			await loginAsDispatcher(this.page);
		});

		try {
			await test.step(`Configurar hold=${options.hold} vía API (read-back crudo)`, async () => {
				await this.setHold(options.hold);
			});

			travelIdRef = await this.seedScheduledTrip(scenario);

			await test.step('Abrir la edición del viaje programado (deep-link mode=3)', async () => {
				await this.openEditForTravel(travelIdRef!.travelId as number);
			});

			await this.editPaymentCardPerVariant(scenario, options.variant);

			await test.step('Verificar que permanece en el detalle del viaje programado', async () => {
				await expect(this.page).toHaveURL(EDIT_DETAIL_URL, { timeout: 15_000 });
			});
		} finally {
			if (travelIdRef) {
				await test.step('Cleanup: cancelar viaje programado', async () => {
					await cancelTravelIfCreated(this.page, travelIdRef!);
				});
			}
			if (options.hold === 'off') {
				await test.step('Restaurar hold al final del test', async () => {
					await this.setHold('on');
				});
			}
		}
	}

	/**
	 * Orquestador de las variantes de EDICIÓN EN CONFLICTO (TC084/086/088).
	 * Precondición vía `RecoverySteps.setupFailedThreeDs` (hold ON + tarjeta 3220 + challenge
	 * RECHAZADO → viaje NO_AUTORIZADO, visible en "En conflicto"); luego edición del método de
	 * pago sobre ese viaje por deep-link (el FE publica el lápiz de edición para NO_AUTH).
	 *
	 * Variantes: 'link-new-card' (débito 8210 mastercardDebit — reemplaza la tarjeta del fallo),
	 * 'select-existing' (4242 ya vinculada — skip si el pax no la tiene, semántica resolveCardFlow) y
	 * 'link-new-3ds' (alwaysAuthenticate 3184 — la 3220 del seed ya quedó vinculada y BL-050
	 * bloquearía re-vincular el mismo número; el challenge se APRUEBA).
	 *
	 * FRAGILE / TODO(live): el guardado sobre un viaje NO_AUTORIZADO re-dispara el recálculo;
	 * si el FE re-ejecuta el hold al guardar, el viaje puede salir de "En conflicto" — el oráculo
	 * de esta fase es la edición efectiva (tarjeta vinculada + guardado sin error + permanencia
	 * en el ABM), no la recuperación del viaje (eso lo cubren los specs de recovery).
	 */
	async runConflictEditScenario(scenario: EditSeedScenario, options: { variant: EditCardVariant }): Promise<void> {
		const recovery = new RecoverySteps({ page: this.page });
		let travelId: string | null = null;

		await test.step('Login carrier', async () => {
			await loginAsDispatcher(this.page);
		});

		if (options.variant === 'select-existing') {
			await test.step('Precondición: el pax debe tener la tarjeta 4242 vinculada (o skip)', async () => {
				const last4 = STRIPE_TEST_CARDS.successDirect.slice(-4);
				const cardCheck = await validateCardPrecondition(this.page, {
					passengerName: scenario.apiSearchQuery ?? scenario.passenger,
					requiredLast4: last4
				});
				test.skip(
					!cardCheck.hasRequiredCard,
					`[card-existing] Precondición: pasajero ${scenario.passenger} debe tener tarjeta ${last4} vinculada.`
				);
			});
		}

		try {
			await test.step('Precondición: limpiar 3220 previa del pax (idempotencia BL-050)', async () => {
				// El seed de conflicto re-ingresa SIEMPRE la 3220 (threeDsFail) vía fillMinimum;
				// BL-050 bloquea "Validar" si el MISMO número ya está vinculado (la tarjeta se
				// attachea al completar los iframes, antes del desenlace del challenge). Sin esta
				// limpieza, el 2.º/3.º test del archivo — y el 1.º en re-runs — revienta en el seed
				// (review 2026-08-05, HIGH-2).
				await this.cleanupPaxCard(scenario, STRIPE_TEST_CARDS.threeDSRequired.slice(-4));
			});

			await test.step('Seed: viaje EN CONFLICTO (NO_AUTORIZADO) vía fallo 3DS', async () => {
				const recoveryScenario: RecoveryScenario = {
					client: scenario.client,
					passenger: scenario.passenger,
					origin: scenario.origin,
					destination: scenario.destination
				};
				travelId = await recovery.setupFailedThreeDs(recoveryScenario);
				// El retorno puede ser '' si la carrera de URLs resolvió primero en `limitExceeded=false`
				// (ver waitForTravelCreation). El estado post-fallo SIEMPRE termina en /travels/{id}
				// (patrón de los specs de recovery) — se re-extrae el id desde la URL final.
				await this.page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
				const match = this.page.url().match(/\/travels\/(\d+)/);
				if (match) travelId = match[1];
				expect(travelId, 'El seed debe resolver el travelId del viaje en conflicto (URL /travels/{id})').toBeTruthy();
			});

			await test.step('Abrir la edición del viaje en conflicto (deep-link mode=3)', async () => {
				await this.openEditForTravel(travelId as string);
			});

			await this.editPaymentCardPerVariant(scenario, options.variant, {
				threeDsCard: STRIPE_TEST_CARDS.alwaysAuthenticate
			});

			await test.step('Verificar que permanece en el ABM de edición tras guardar', async () => {
				await expect(this.page).toHaveURL(EDIT_DETAIL_URL, { timeout: 15_000 });
			});
		} finally {
			if (travelId) {
				await test.step('Cleanup: cancelar viaje en conflicto', async () => {
					const id = Number(travelId);
					if (Number.isFinite(id)) {
						await cancelTravel(this.page, id).catch(() => undefined);
					}
				});
			}
		}
	}
}
