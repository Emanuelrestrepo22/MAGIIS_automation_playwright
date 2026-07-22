/**
 * KATA Steps (orquestador de flujo) — Carrier · Recovery post-fallo 3DS (Stripe).
 *
 * Reproduce el orquestador legacy `setupTravelWithFailed3DS`
 * (`features/gateway-pg/helpers/stripe/recovery.helpers.ts`) como Step KATA, componiendo
 * las Page components `CarrierOperationalPreferencesPage` + `CarrierNewTravelPage` +
 * `ThreeDsChallengePage` — patrón idéntico a `CarrierHoldSteps`. El flujo: hold ON →
 * alta con tarjeta threeDSRequired (4000000000003220, recuperable) → challenge 3DS
 * RECHAZADO (completeFail) → el viaje queda en NO_AUTORIZADO ("En conflicto"). El retry
 * (completar el challenge desde el detalle) recupera el viaje → "Buscando conductor".
 *
 * Authorize.net NO usa 3DS → este Step NO aplica a otros gateways.
 *
 * Convención KATA aplicada:
 *   - Extiende UiBase (usa `this.page`); instancia las Page components internamente.
 *   - Import por alias (@ui, @features) — sin relativos nuevos.
 *   - Orquesta → NO @atc directo: el @atc vive en las Page components (fillMinimum →
 *     MG-148, completeFail 3DS → MG-153).
 */

import type { TestContextOptions } from '@TestContext';

import { test } from '@TestFixture';
import { UiBase } from '@ui/UiBase';
import { ThreeDsChallengePage } from '@ui/ThreeDsChallengePage';
import { CarrierNewTravelPage, CarrierOperationalPreferencesPage } from '@ui/carrier';
import { STRIPE_TEST_CARDS } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { extractTravelIdFromUrl } from '@features/gateway-pg/helpers/journey-url.helpers';

/** Datos mínimos del alta que deriva en el fallo 3DS recuperable. */
export type RecoveryScenario = {
	/** Cliente del viaje (opcional; app pax lo auto-asigna desde el pasajero). */
	client?: string;
	passenger: string;
	origin: string;
	destination: string;
};

export class RecoverySteps extends UiBase {
	readonly preferences: CarrierOperationalPreferencesPage;
	readonly travel: CarrierNewTravelPage;
	readonly threeDs: ThreeDsChallengePage;

	constructor(options: TestContextOptions) {
		super(options);
		const opts = { page: this.page };
		this.preferences = new CarrierOperationalPreferencesPage(opts);
		this.travel = new CarrierNewTravelPage(opts);
		this.threeDs = new ThreeDsChallengePage(opts);
	}

	/**
	 * Crea un viaje con fallo 3DS RECUPERABLE y rechaza el challenge — el viaje se crea
	 * directamente en NO_AUTORIZADO. Reproduce `setupTravelWithFailed3DS` vía componentes
	 * KATA. Retorna el travelId del viaje creado.
	 */
	async setupFailedThreeDs(scenario: RecoveryScenario): Promise<string> {
		await test.step('Activar hold en preferencias operativas', async () => {
			await this.preferences.goto();
			await this.preferences.ensureHoldEnabled();
		});

		await test.step('Crear viaje con tarjeta 3DS recuperable (4000 0000 0000 3220)', async () => {
			await this.travel.goto();
			await this.travel.fillMinimum({
				...scenario,
				cardLast4: STRIPE_TEST_CARDS.threeDSRequired.slice(-4),
			});
			await this.travel.submit();
		});

		await test.step('Rechazar el challenge 3DS (Popup A Stripe) → viaje en NO_AUTORIZADO', async () => {
			await this.threeDs.waitForVisible();
			await this.threeDs.completeFail();
			await this.threeDs.waitForHidden();
		});

		return extractTravelIdFromUrl(this.page);
	}
}
