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
 * Convención KATA aplicada:
 *   - Extiende UiBase (usa `this.page`); instancia las Page components internamente.
 *   - Import por alias (@ui, @features, @utils, @TestFixture) — sin relativos nuevos.
 *
 * NOTA @atc — los ATC mapeados a MG viven en las Page components (linkAndValidatePreauthorizedCard
 * → MG-415, confirmLinkedCardAndSave → MG-416 (área EDIT); 3DS success/fail → MG-152/153); este
 * Step orquesta, no mapea TCs directamente. mapeo por área aceptado (idmap sin 1:1 UI).
 */

import type { TestContextOptions } from '@TestContext';

import { test, expect } from '@TestFixture';
import { UiBase } from '@ui/UiBase';
import { ThreeDsChallengePage } from '@ui/ThreeDsChallengePage';
import { ThreeDsErrorPopup } from '@ui/ThreeDsErrorPopup';
import { CarrierTravelDetailPage, CarrierTravelManagementPage } from '@ui/carrier';
import {
	expectNoThreeDSModal,
	loginAsDispatcher,
	STRIPE_TEST_CARDS
} from '@features/gateway-pg/fixtures/gateway.fixtures';

const SCHEDULED_TRIP_DETAIL_URL = /\/home\/carrier\/travel\/detail\?travelId=\d+&mode=3/;
const AUTH_ERROR_MESSAGE = /autentic|authenticate|unable to authenticate/i;

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
	 * Orquestador reusable: entra a un viaje programado y edita su método de pago probando
	 * los tres caminos de tarjeta (3DS aprobada, 3DS rechazada con popup, débito sin 3DS),
	 * guardando la tarjeta de débito. Corresponde a TS-STRIPE-P2-TC078.
	 */
	async runScheduledTripCardEdit(): Promise<void> {
		await test.step('Login carrier', async () => {
			await loginAsDispatcher(this.page);
		});

		await test.step('Abrir viajes programados y entrar al detalle', async () => {
			await this.management.goto();
			await this.management.openScheduledTrips();
			await this.management.openFirstScheduledTripDetail();
			await expect(this.page).toHaveURL(SCHEDULED_TRIP_DETAIL_URL, { timeout: 15_000 });
		});

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

		await test.step('Vincular tarjeta de débito, seleccionarla y guardar', async () => {
			await this.detail.linkAndValidatePreauthorizedCard(STRIPE_TEST_CARDS.mastercardDebit);
			await expectNoThreeDSModal(this.page);
			await this.detail.confirmLinkedCardAndSave(/Tarjeta de cr[eé]dito MASTERCARD/i);
		});

		await test.step('Verificar que permanece en el detalle del viaje programado', async () => {
			await expect(this.page).toHaveURL(SCHEDULED_TRIP_DETAIL_URL, { timeout: 15_000 });
		});
	}
}
