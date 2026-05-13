import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { getPortalUrl } from '../../../config/gatewayPortalRuntime';
import { resolveLoginPath } from '../../../config/runtime';
import { debugLog } from '../../../helpers/debug';
import {
	CONTRACTOR_COLLABORATOR,
	DISPATCHER,
	PAX_WEB,
	getCurrentUserEnvironment,
} from '../../../fixtures/users';
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

/**
 * Login rápido del portal carrier para journeys disparados por dispatcher.
 *
 * BL-009 Fase 3 (2026-05-13) — credenciales resueltas vía `DISPATCHER[env]`
 * (SoT canónica `tests/fixtures/users/web-portals/dispatcher.ts`). Antes leía
 * `getPortalCredentials('carrier')` que delegaba a `process.env.CARRIER_USER`.
 * La URL del portal sigue viniendo de `gatewayPortalRuntime.ts` (legítimo —
 * config de URL, no de credenciales).
 */
export async function loginAsDispatcher(page: Page): Promise<void> {
	const dispatcher = DISPATCHER[getCurrentUserEnvironment()];
	const loginPage = new LoginPage(page, 'carrier', getPortalUrl('carrier'));
	const dashboardPage = new DashboardPage(page);
	await runLoginPhase('carrier', 'goto', () => loginPage.goto());
	await runLoginPhase('carrier', 'submit', () => loginPage.login(dispatcher.email, dispatcher.password));
	await runLoginPhase('carrier', 'dashboard', () => dashboardPage.ensureDashboardLoaded());
}

/**
 * Login del portal contractor.
 *
 * BL-009 Fase 3 (2026-05-13) — credenciales resueltas vía
 * `CONTRACTOR_COLLABORATOR[env]` (SoT canónica
 * `tests/fixtures/users/web-portals/contractor-collaborator.ts`). Antes leía
 * `resolveRoleCredentials('contractor')` que delegaba a `USER_CONTRACTOR`.
 * El login path sigue viniendo de `runtime.ts:resolveLoginPath('contractor')`
 * porque es config de routing, no de credenciales.
 */
export async function loginAsContractor(page: Page): Promise<void> {
	const collaborator = CONTRACTOR_COLLABORATOR[getCurrentUserEnvironment()];
	const baseUrl = process.env.BASE_URL ?? '';
	const loginPath = resolveLoginPath('contractor');
	const loginPage = new LoginPage(page, 'contractor', `${baseUrl}${loginPath}`);
	const dashboardPage = new DashboardPage(page);
	await runLoginPhase('contractor', 'goto', () => loginPage.goto());
	await runLoginPhase('contractor', 'submit', () => loginPage.login(collaborator.email, collaborator.password));
	await runLoginPhase('contractor', 'dashboard', () => dashboardPage.ensureDashboardLoaded());
}

/**
 * Login del portal pax cuando la prueba nace del wallet.
 *
 * BL-009 Fase 3.1 (2026-05-13) — credenciales resueltas vía `PAX_WEB[env]`
 * (SoT canónica `tests/fixtures/users/web-portals/pax-web.ts`). Antes leía
 * `getPortalCredentials('pax')` que delegaba a `process.env.PAX_USER` directo
 * sin suffix por ambiente. La URL del portal sigue viniendo de
 * `gatewayPortalRuntime.ts:getPortalUrl('pax')` (legítimo — config de routing,
 * no de credenciales).
 *
 * `getPortalCredentials('pax')` del runtime legacy queda intacto para
 * retrocompatibilidad de otros consumers eventuales.
 */
export async function loginAsPax(page: Page): Promise<void> {
	const paxUser = PAX_WEB[getCurrentUserEnvironment()];
	const loginPage = new LoginPage(page, 'pax', getPortalUrl('pax'));
	await loginPage.goto();
	await loginPage.login(paxUser.email, paxUser.password);
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
