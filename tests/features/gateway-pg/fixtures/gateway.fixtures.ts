import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { getPortalUrl } from '../../../config/gatewayPortalRuntime';
import { STRIPE_CVC, STRIPE_EXPIRY, STRIPE_TEST_CARDS, TEST_DATA } from '../data/stripeTestData';
import { NewTravelPage, TravelDetailPage, TravelManagementPage } from '../../../pages/carrier';
import { ThreeDSModal, ThreeDSErrorPopup } from '../pages';

// Reexportamos estos datos para que las specs de gateway importen todo
// desde una sola entrada y no tengan que conocer la estructura interna del módulo.
export { STRIPE_CVC, STRIPE_EXPIRY, STRIPE_TEST_CARDS, TEST_DATA, getPortalUrl };

// Login desacoplado (Fase C, 2026-07-14): los helpers de login viven ahora en la capa
// auth compartida (`features/auth/helpers/login.helpers.ts`). Se re-exportan acá por
// compatibilidad con las specs de gateway que los importan desde este barrel.
export { loginAsDispatcher, loginAsContractor, loginAsPax } from '../../auth/helpers/login.helpers';

const THREE_DS_MODAL_SELECTOR = 'iframe[src*="three-ds-2-challenge"]';

export async function expectNoThreeDSModal(page: Page): Promise<void> {
	// Helper explícito para casos donde el flujo NO debería disparar autenticación 3DS.
	await expect(page.locator(THREE_DS_MODAL_SELECTOR)).toBeHidden({ timeout: 5_000 });
}

// Reexportamos helpers y page objects para que una spec de gateway pueda armar
// el journey completo desde este mismo archivo de fixtures.
export { extractTravelIdFromUrl, setupTravelWithFailed3DS } from '../helpers/stripe.helpers';
export { NewTravelPage, ThreeDSModal, ThreeDSErrorPopup, TravelDetailPage, TravelManagementPage };
