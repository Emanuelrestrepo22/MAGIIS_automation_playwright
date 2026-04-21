import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { getPortalCredentials, getPortalUrl } from '../../../config/gatewayPortalRuntime';
import { resolveRoleCredentials, resolveLoginPath } from '../../../config/runtime';
import { debugLog } from '../../../helpers/debug';
import { DashboardPage } from '../../../pages/carrier';
import { LoginPage } from '../../../pages/shared';
import { STRIPE_CVC, STRIPE_EXPIRY, STRIPE_TEST_CARDS, TEST_DATA } from '../data/stripeTestData';
import { NewTravelPage, ThreeDSModal, ThreeDSErrorPopup, TravelDetailPage, TravelManagementPage } from '../../../pages/carrier';

// Reexportamos estos datos para que las specs de gateway importen todo
// desde una sola entrada y no tengan que conocer la estructura interna del módulo.
export { STRIPE_CVC, STRIPE_EXPIRY, STRIPE_TEST_CARDS, TEST_DATA, getPortalUrl };
const THREE_DS_MODAL_SELECTOR = 'iframe[src*="three-ds-2-challenge"]';

type LoginPhase = 'goto' | 'submit' | 'dashboard';

// Instrumentación BL-002 (TC1033): envuelve cada fase del login para identificar
// cuál falla en runs flaky. Relanza el error con prefijo `[login:<phase>]` para
// que el stacktrace deje claro qué paso rompió sin mirar los logs. Duraciones
// viajan por `debugLog('auth', ...)` — activar con `DEBUG=auth` en .env.
async function runLoginPhase<T>(role: string, phase: LoginPhase, fn: () => Promise<T>): Promise<T> {
	const start = Date.now();
	try {
		const result = await fn();
		debugLog('auth', `[${role}:${phase}] ok in ${Date.now() - start}ms`);
		return result;
	} catch (err) {
		const duration = Date.now() - start;
		const original = err instanceof Error ? err.message : String(err);
		debugLog('auth', `[${role}:${phase}] FAILED after ${duration}ms — ${original}`);
		throw new Error(`[login:${phase}][${role}] ${original} (after ${duration}ms)`);
	}
}

export async function loginAsDispatcher(page: Page): Promise<void> {
	// Login rápido del portal carrier para journeys disparados por dispatcher.
	const { user, pass } = getPortalCredentials('carrier');
	const loginPage = new LoginPage(page, 'carrier', getPortalUrl('carrier'));
	const dashboardPage = new DashboardPage(page);
	await runLoginPhase('carrier', 'goto', () => loginPage.goto());
	await runLoginPhase('carrier', 'submit', () => loginPage.login(user, pass));
	await runLoginPhase('carrier', 'dashboard', () => dashboardPage.ensureDashboardLoaded());
}

export async function loginAsContractor(page: Page): Promise<void> {
	// Login del portal contractor. Credenciales vienen de USER_CONTRACTOR / PASS_CONTRACTOR.
	const { username, password } = resolveRoleCredentials('contractor');
	const baseUrl = process.env.BASE_URL ?? '';
	const loginPath = resolveLoginPath('contractor');
	const loginPage = new LoginPage(page, 'contractor', `${baseUrl}${loginPath}`);
	const dashboardPage = new DashboardPage(page);
	await runLoginPhase('contractor', 'goto', () => loginPage.goto());
	await runLoginPhase('contractor', 'submit', () => loginPage.login(username, password));
	await runLoginPhase('contractor', 'dashboard', () => dashboardPage.ensureDashboardLoaded());
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
export { extractTravelIdFromUrl, setupTravelWithFailed3DS } from '../helpers/stripe.helpers';
export { NewTravelPage, ThreeDSModal, ThreeDSErrorPopup, TravelDetailPage, TravelManagementPage };
