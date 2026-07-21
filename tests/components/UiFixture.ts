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

export class UiFixture extends UiBase {
	/** Modal 3DS de Stripe (feature gateway-pg). */
	readonly threeDs: ThreeDsChallengePage;

	constructor(options: TestContextOptions) {
		super(options);
		this.threeDs = new ThreeDsChallengePage(options);
	}
}
