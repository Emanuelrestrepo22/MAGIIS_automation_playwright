/**
 * KATA Steps (orquestador de flujo) — Carrier · Edición de Viaje Programado (Operaciones).
 *
 * Extrae el flujo de edición del método de pago de un viaje programado (que estaba inline
 * en `operaciones/edicion-programados.spec.ts`) a un Step reusable KATA. Un Step orquesta
 * varios ATC de las Page components (@ui/carrier + @ui/ThreeDsChallengePage + @ui/ThreeDsErrorPopup)
 * y helpers de dominio.
 *
 * Cubre el escenario TS-STRIPE-P2-TC078: entrar al detalle de un viaje programado y editar
 * el método de pago vinculando (a) una tarjeta 3DS aprobada, (b) una tarjeta 3DS rechazada
 * (popup de error), y (c) una tarjeta de débito sin 3DS, guardando finalmente esta última.
 *
 * ── MULTI-PASARELA (2026-07-29) ──────────────────────────────────────────────────────────────
 * El Step ya NO está atado a Stripe: `runScheduledTripCardEdit({ gateway })` corre el mismo patrón
 * de edición (entrar al viaje programado → vincular tarjeta nueva → seleccionarla → guardar) sobre
 * cualquier pasarela, usando el Strategy de form correspondiente (`cardFormFor`). Los dos pasos de
 * challenge 3DS se emiten SÓLO si `adapter.requires3ds` — Authorize / eBizCharge / Mercado Pago no
 * usan 3DS en el flujo MAGIIS, así que para ellas esos pasos no existen (no se "saltean").
 * Invocado SIN argumentos, el comportamiento histórico Stripe queda intacto byte a byte.
 * ⚠️ El path no-Stripe todavía NO se ejecutó en vivo — ver el TODO(live) de
 * `CarrierTravelDetailPage.linkAndValidateCardForGateway` (el Strategy nativo fue verificado
 * contra el form del ALTA, no contra el de la EDICIÓN).
 *
 * Convención KATA aplicada:
 *   - Extiende UiBase (usa `this.page`); instancia las Page components internamente.
 *   - Import por alias (@ui, @features, @utils, @TestFixture) — sin relativos nuevos.
 *
 * NOTA @atc — los ATC mapeados a MG viven en las Page components (linkAndValidatePreauthorizedCard
 * → MG-415, confirmLinkedCardAndSave → MG-416 (área EDIT); 3DS success/fail → MG-152/153); este
 * Step orquesta, no mapea TCs directamente. mapeo por área aceptado (idmap sin 1:1 UI).
 */

import type { TestContextOptions } from '@TestContext';
import type { CardIntent, GatewayName } from '@fixtures/gateways/_shared';

import { test, expect } from '@TestFixture';
import { resolveCard } from '@fixtures/gateways/_shared';
import { UiBase } from '@ui/UiBase';
import { ThreeDsChallengePage } from '@ui/ThreeDsChallengePage';
import { ThreeDsErrorPopup } from '@ui/ThreeDsErrorPopup';
import { CarrierTravelDetailPage, CarrierTravelManagementPage } from '@ui/carrier';
import { getGatewayPgAdapter } from '@features/gateway-pg/helpers/adapters';
import {
	expectNoThreeDSModal,
	loginAsDispatcher,
	STRIPE_TEST_CARDS
} from '@features/gateway-pg/fixtures/gateway.fixtures';

const SCHEDULED_TRIP_DETAIL_URL = /\/home\/carrier\/travel\/detail\?travelId=\d+&mode=3/;
const AUTH_ERROR_MESSAGE = /autentic|authenticate|unable to authenticate/i;

/** Etiqueta de la tarjeta ya vinculada en el selector del detalle (Stripe / TC078 histórico). */
const STRIPE_LINKED_CARD_LABEL = /Tarjeta de cr[eé]dito MASTERCARD/i;

/** Opciones de `runScheduledTripCardEdit`. Sin argumentos = comportamiento histórico Stripe. */
export type ScheduledTripCardEditOptions = {
	/**
	 * Pasarela activa del carrier. OMITIDO = comportamiento histórico idéntico (TS-STRIPE-P2-TC078:
	 * credenciales del dispatcher default + tarjetas `STRIPE_TEST_CARDS` + los dos caminos 3DS).
	 * Con una pasarela SIN 3DS (`adapter.requires3ds === false`: Authorize / eBizCharge /
	 * Mercado Pago) los dos pasos de challenge NO se emiten — no existen en esa pasarela.
	 */
	gateway?: GatewayName;
	/** Intent de la tarjeta a vincular y guardar (solo path multi-pasarela). Default happy sin 3DS. */
	intent?: CardIntent;
	/**
	 * Etiqueta de la tarjeta vinculada a seleccionar antes de guardar. Defaults: en el path
	 * histórico Stripe, la Mastercard de TC078; en el multi-pasarela, un matcher AGNÓSTICO de marca
	 * (`/Tarjeta de crédito/i`) que alcanza cuando la recién vinculada es la única del selector.
	 * OBLIGATORIO pasarla cuando hay varias tarjetas vinculadas (si no, el match es ambiguo).
	 */
	linkedCardLabel?: string | RegExp;
};

export class CarrierTravelEditSteps extends UiBase {
	readonly management: CarrierTravelManagementPage;
	readonly detail: CarrierTravelDetailPage;
	readonly threeDs: ThreeDsChallengePage;
	readonly errorPopup: ThreeDsErrorPopup;

	constructor(options: TestContextOptions) {
		super(options);
		const opts = { page: this.page };
		this.management = new CarrierTravelManagementPage(opts);
		this.detail = new CarrierTravelDetailPage(opts);
		this.threeDs = new ThreeDsChallengePage(opts);
		this.errorPopup = new ThreeDsErrorPopup(opts);
	}

	/**
	 * Orquestador reusable: entra a un viaje programado y edita su método de pago, vinculando una
	 * tarjeta nueva y guardándola.
	 *
	 * SIN argumentos reproduce TS-STRIPE-P2-TC078 byte a byte: los tres caminos de tarjeta Stripe
	 * (3DS aprobada, 3DS rechazada con popup de error, débito sin 3DS) guardando la de débito.
	 *
	 * Con `options.gateway` de una pasarela SIN 3DS (Authorize / eBizCharge / Mercado Pago) el
	 * recorrido se reduce a lo que esa pasarela realmente tiene: login con sus credenciales →
	 * detalle del viaje programado → vincular la tarjeta del intent por el form NATIVO →
	 * seleccionarla y guardar. Los dos pasos de challenge NO se emiten porque el flujo MAGIIS de
	 * esas pasarelas no dispara 3DS (`adapter.requires3ds === false`) — no se "saltean" pasos de un
	 * TC, es que el TC no existe fuera de Stripe.
	 */
	async runScheduledTripCardEdit(options: ScheduledTripCardEditOptions = {}): Promise<void> {
		const gateway: GatewayName = options.gateway ?? 'stripe';
		const adapter = getGatewayPgAdapter(gateway);
		// Sólo se pasan opciones de login cuando el caller eligió pasarela: omitirlas preserva la
		// resolución de credenciales histórica (dispatcher default) del spec TC078 que ya pasa.
		const loginOptions = options.gateway ? { gateway: options.gateway } : undefined;

		await test.step(`Login carrier (${gateway})`, async () => {
			await loginAsDispatcher(this.page, loginOptions);
		});

		await test.step('Abrir viajes programados y entrar al detalle', async () => {
			await this.management.goto();
			await this.management.openScheduledTrips();
			await this.management.openFirstScheduledTripDetail();
			await expect(this.page).toHaveURL(SCHEDULED_TRIP_DETAIL_URL, { timeout: 15_000 });
		});

		if (adapter.requires3ds) {
			await test.step('Vincular primera tarjeta y aprobar 3DS', async () => {
				await this.detail.linkAndValidatePreauthorizedCard(STRIPE_TEST_CARDS.threeDSRequired);
				await this.threeDs.waitForVisible();
				await this.threeDs.completeSuccess();
				await this.threeDs.waitForHidden();
			});

			await test.step('Vincular segunda tarjeta y rechazar 3DS', async () => {
				await this.detail.linkAndValidatePreauthorizedCard(STRIPE_TEST_CARDS.alwaysAuthenticate);
				await this.threeDs.waitForVisible();
				await this.threeDs.completeFail();
				await this.errorPopup.waitForVisible();

				const message = await this.errorPopup.getMessage();
				expect(message ?? '').toMatch(AUTH_ERROR_MESSAGE);
				await this.errorPopup.accept();
			});
		}

		await test.step('Vincular tarjeta a guardar, seleccionarla y guardar', async () => {
			if (gateway === 'stripe') {
				// Path histórico intacto: débito Mastercard vía el form Stripe Elements del POM legacy.
				await this.detail.linkAndValidatePreauthorizedCard(STRIPE_TEST_CARDS.mastercardDebit);
				await expectNoThreeDSModal(this.page);
				await this.detail.confirmLinkedCardAndSave(options.linkedCardLabel ?? STRIPE_LINKED_CARD_LABEL);
				return;
			}

			const card = resolveCard({ gateway, intent: options.intent ?? 'HAPPY_NO_AUTH' });
			await this.detail.linkAndValidateCardForGateway({ gateway, card });
			await expectNoThreeDSModal(this.page);
			// El selector del detalle etiqueta la tarjeta con su marca ("Tarjeta de crédito MASTERCARD"
			// en el único caso verificado, Stripe). `GenericTestCard` NO expone la marca, y derivarla
			// del número (BIN) sería inventar el copy exacto que usa el portal ("AMEX" vs "AMERICAN
			// EXPRESS", etc.). Default AGNÓSTICO: cualquier tarjeta de crédito vinculada — suficiente
			// cuando la recién vinculada es la única. Con varias tarjetas en el selector, el caller
			// DEBE desambiguar con `options.linkedCardLabel`.
			await this.detail.confirmLinkedCardAndSave(options.linkedCardLabel ?? /Tarjeta de cr[eé]dito/i);
		});

		await test.step('Verificar que permanece en el detalle del viaje programado', async () => {
			await expect(this.page).toHaveURL(SCHEDULED_TRIP_DETAIL_URL, { timeout: 15_000 });
		});
	}
}
