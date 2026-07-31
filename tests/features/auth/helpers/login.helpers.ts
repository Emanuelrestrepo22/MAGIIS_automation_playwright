// tests/features/auth/helpers/login.helpers.ts
//
// Helpers de login por portal — capa AUTH compartida (Fase C, 2026-07-14).
// Movidos desde `features/gateway-pg/fixtures/gateway.fixtures.ts` para desacoplar el
// login de la feature gateway: cualquier feature (flights, gateway, …) importa el login
// desde acá. `gateway.fixtures.ts` los re-exporta por compatibilidad.

import type { Page } from '@playwright/test';
import { getPortalUrl } from '../../../config/gatewayPortalRuntime';
import { resolveLoginPath } from '../../../config/runtime';
import { debugLog } from '../../../helpers/debug';
import {
	CONTRACTOR_COLLABORATOR,
	DISPATCHER,
	PAX_WEB,
	getContractorCollaborator,
	getCurrentUserEnvironment,
	getDispatcher
} from '../../../fixtures/users';
import type { GatewayName } from '../../../fixtures/gateways/_shared';
import { DashboardPage } from '../../../pages/carrier';
import { LoginPage } from '../../../pages/shared';
import { ensureSpanishLanguage } from '../../../pages/shared/i18n';

/** Opciones de login por portal. `gateway` selecciona credenciales por pasarela. */
type LoginOptions = { gateway?: GatewayName };

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

// MG-178: el login en TEST es intermitentemente flaky (la fase `dashboard` queda en la página de
// login sin redirigir → cascada de fallos en familias enteras). Reintentamos la secuencia completa
// (goto+submit+dashboard) hasta 3 veces antes de fallar. Cada reintento re-navega al login.
const LOGIN_ATTEMPTS = 3;

async function loginWithRetry(role: string, page: Page, run: () => Promise<void>): Promise<void> {
	let lastErr: unknown;
	for (let attempt = 1; attempt <= LOGIN_ATTEMPTS; attempt++) {
		try {
			await run();
			return;
		} catch (err) {
			lastErr = err;
			debugLog('auth', `[${role}] login intento ${attempt}/${LOGIN_ATTEMPTS} falló — ${err instanceof Error ? err.message : String(err)}`);
			if (attempt < LOGIN_ATTEMPTS) await page.waitForTimeout(2_000);
		}
	}
	throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Login rápido del portal carrier para journeys disparados por dispatcher.
 *
 * BL-009 Fase 3 (2026-05-13) — credenciales resueltas vía `DISPATCHER[env]`
 * (SoT canónica `tests/fixtures/users/web-portals/dispatcher.ts`).
 * La URL del portal viene de `gatewayPortalRuntime.ts` (config de URL, no de credenciales).
 *
 * `opts.gateway` selecciona credenciales por pasarela (`getDispatcher(gateway)`);
 * omitido = comportamiento default idéntico (carrier base vía `DISPATCHER[env]`).
 */
export async function loginAsDispatcher(page: Page, opts?: LoginOptions): Promise<void> {
	const dispatcher = opts?.gateway ? getDispatcher(opts.gateway) : DISPATCHER[getCurrentUserEnvironment()];
	const loginPage = new LoginPage(page, 'carrier', getPortalUrl('carrier'));
	const dashboardPage = new DashboardPage(page);
	await loginWithRetry('carrier', page, async () => {
		await runLoginPhase('carrier', 'goto', () => loginPage.goto());
		await runLoginPhase('carrier', 'submit', () => loginPage.login(dispatcher.email, dispatcher.password));
		await runLoginPhase('carrier', 'dashboard', () => dashboardPage.ensureDashboardLoaded());
	});
	// BL-i18n: forzar ES (cuentas US arrancan en inglés y rompen selectores por texto).
	await ensureSpanishLanguage(page);
}

/**
 * Login del portal contractor.
 *
 * BL-009 Fase 3 (2026-05-13) — credenciales vía `CONTRACTOR_COLLABORATOR[env]`
 * (SoT `tests/fixtures/users/web-portals/contractor-collaborator.ts`). El login path
 * viene de `runtime.ts:resolveLoginPath('contractor')` (config de routing).
 *
 * `opts.gateway` selecciona credenciales por pasarela (`getContractorCollaborator(gateway)`);
 * omitido = comportamiento default idéntico (contractor base vía `CONTRACTOR_COLLABORATOR[env]`).
 */
export async function loginAsContractor(page: Page, opts?: LoginOptions): Promise<void> {
	const collaborator = opts?.gateway
		? getContractorCollaborator(opts.gateway)
		: CONTRACTOR_COLLABORATOR[getCurrentUserEnvironment()];
	const baseUrl = process.env.BASE_URL ?? '';
	const loginPath = resolveLoginPath('contractor');
	const loginPage = new LoginPage(page, 'contractor', `${baseUrl}${loginPath}`);
	const dashboardPage = new DashboardPage(page);
	await loginWithRetry('contractor', page, async () => {
		await runLoginPhase('contractor', 'goto', () => loginPage.goto());
		await runLoginPhase('contractor', 'submit', () => loginPage.login(collaborator.email, collaborator.password));
		await runLoginPhase('contractor', 'dashboard', () => dashboardPage.ensureDashboardLoaded());
	});
	// BL-i18n: forzar ES (cuentas US arrancan en inglés y rompen selectores por texto).
	await ensureSpanishLanguage(page);
}

/**
 * Login del portal pax cuando la prueba nace del wallet.
 *
 * BL-009 Fase 3.1 (2026-05-13) — credenciales vía `PAX_WEB[env]`
 * (SoT `tests/fixtures/users/web-portals/pax-web.ts`). La URL viene de
 * `gatewayPortalRuntime.ts:getPortalUrl('pax')` (config de routing).
 */
export async function loginAsPax(page: Page): Promise<void> {
	const paxUser = PAX_WEB[getCurrentUserEnvironment()];
	const loginPage = new LoginPage(page, 'pax', getPortalUrl('pax'));
	await loginPage.goto();
	await loginPage.login(paxUser.email, paxUser.password);
	await page.waitForURL('**/home**', { timeout: 15_000 });
}
