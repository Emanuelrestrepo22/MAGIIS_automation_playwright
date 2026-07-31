/**
 * KATA Architecture — Layer 4: UI Fixture.
 *
 * Contenedor de inyección de dependencias de los componentes UI. Todos comparten el
 * mismo page context (mismas options) → estado de browser consistente entre componentes.
 *
 * CÓMO AGREGAR UN COMPONENTE UI:
 *   1. Creá el componente en tests/components/ui/YourPage.ts (extends UiBase).
 *   2. Importalo acá.
 *   3. Declaralo readonly + inicializalo en el constructor con las mismas options.
 */

import type { TestContextOptions } from '@TestContext';

import { ThreeDsChallengePage } from '@ui/ThreeDsChallengePage';
import { UiBase } from '@ui/UiBase';
import {
	CarrierGlobalIntegrationsPage,
	CarrierQuotePage,
	CarrierRecurrentTravelPage,
} from '@ui/carrier';

export class UiFixture extends UiBase {
	/** Modal 3DS de Stripe (feature gateway-pg). */
	readonly threeDs: ThreeDsChallengePage;

	// Scaffolding MG-178 (áreas quote/recurrentes/config sin POM previo).
	readonly quote: CarrierQuotePage;
	readonly recurrent: CarrierRecurrentTravelPage;
	readonly integrations: CarrierGlobalIntegrationsPage;

	constructor(options: TestContextOptions) {
		super(options);
		this.threeDs = new ThreeDsChallengePage(options);
		this.quote = new CarrierQuotePage(options);
		this.recurrent = new CarrierRecurrentTravelPage(options);
		this.integrations = new CarrierGlobalIntegrationsPage(options);
	}
}
