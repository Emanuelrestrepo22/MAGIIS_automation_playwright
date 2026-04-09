import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { getPortalCredentials, getPortalUrl } from '../config/gatewayPortalRuntime';
import { DashboardPage } from '../pages/DashboardPage';
import { LoginPage } from '../pages/LoginPage';
import { STRIPE_CVC, STRIPE_EXPIRY, STRIPE_TEST_CARDS, TEST_DATA } from '../shared/gateway-pg/stripeTestData';
import { NewTravelPage, ThreeDSModal, ThreeDSErrorPopup, TravelDetailPage, TravelManagementPage } from '../pages/gateway-pg';

// Reexportamos estos datos para que las specs de gateway importen todo
// desde una sola entrada y no tengan que conocer la estructura interna del módulo.
export { STRIPE_CVC, STRIPE_EXPIRY, STRIPE_TEST_CARDS, TEST_DATA, getPortalUrl };
const THREE_DS_MODAL_SELECTOR = 'iframe[src*="three-ds-2-challenge"]';

export async function loginAsDispatcher(page: Page): Promise<void> {
	// Login rápido del portal carrier para journeys disparados por dispatcher.
	const { user, pass } = getPortalCredentials('carrier');
	const loginPage = new LoginPage(page, 'carrier', getPortalUrl('carrier'));
	const dashboardPage = new DashboardPage(page);
	await loginPage.goto();
	await loginPage.login(user, pass);
	await dashboardPage.ensureDashboardLoaded();
}

export async function loginAsPax(page: Page): Promise<void> {
	// Login equivalente para el portal de pasajero cuando la prueba nace del wallet.
	const { user, pass } = getPortalCredentials('pax');
	const loginPage = new LoginPage(page, 'pax', getPortalUrl('pax'));
	await loginPage.goto();
	await loginPage.login(user, pass);
	await page.waitForURL('**/home**', { timeout: 15_000 });
}

export async function expectNoThreeDSModal(page: Page): Promise<void> {
	// Helper explícito para casos donde el flujo NO debería disparar autenticación 3DS.
	await expect(page.locator(THREE_DS_MODAL_SELECTOR)).toBeHidden({ timeout: 5_000 });
}

// Reexportamos helpers y page objects para que una spec de gateway pueda armar
// el journey completo desde este mismo archivo de fixtures.
export { extractTravelIdFromUrl, setupTravelWithFailed3DS } from '../helpers/gateway-pg/stripe.helpers';
export { NewTravelPage, ThreeDSModal, ThreeDSErrorPopup, TravelDetailPage, TravelManagementPage };
