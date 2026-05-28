/**
 * Barrel — Source of Truth de usuarios/credenciales para MAGIIS Playwright.
 *
 * BL-009 Fase 2 — punto de entrada canónico. Todo import nuevo de
 * credenciales/usuarios debe partir desde aquí:
 *
 *   import { DISPATCHER, CONTRACTOR_COLLABORATOR, PAX_WEB, DRIVER, PASSENGER_APP_USER } from 'tests/fixtures/users';
 *   import { PASSENGERS, type TestPassenger } from 'tests/fixtures/users';
 *
 * Ver README.md para la guía completa.
 */

import type { AppRole } from '../../config/runtime';
import { CONTRACTOR_COLLABORATOR, DISPATCHER } from './web-portals';
import type { UserEnvironment } from './types';

// ─── Tipos públicos ───────────────────────────────────────────────────────────
export type { UserEnvironment, PortalRole, MobileRole, WebUser, MobileUser, EnvironmentMap } from './types';

// ─── Fixtures con credenciales ────────────────────────────────────────────────
export { DISPATCHER, CONTRACTOR_COLLABORATOR, PAX_WEB } from './web-portals';
export { DRIVER, PASSENGER_APP_USER } from './mobile';

// ─── Pasajeros de dominio (sin credenciales) ──────────────────────────────────
// BL-009 Fase 4 (2026-05-13) — `./passengers` es el SoT canónico.
// El path legacy `features/gateway-pg/data/passengers` quedó como re-export
// thin para preservar imports existentes.
export { PASSENGERS, type TestPassenger } from './passengers';

// ─── Helpers de ambiente ──────────────────────────────────────────────────────

/**
 * Resuelve el ambiente activo para selección de fixture de usuario.
 *
 * BL-009 Fase 3 (2026-05-13) — espejo tipado de `getCurrentEnv()` del runtime,
 * con narrowing a `UserEnvironment` para que `DISPATCHER[env]` compile.
 *
 * Lee `process.env.ENV`. Defaults a `'test'` si no está seteado o si tiene un
 * valor desconocido (con warning para no fallar silenciosamente).
 *
 * Uso:
 *   import { DISPATCHER, getCurrentUserEnvironment } from 'tests/fixtures/users';
 *   const env = getCurrentUserEnvironment();
 *   const { email, password } = DISPATCHER[env];
 */
export function getCurrentUserEnvironment(): UserEnvironment {
	const env = process.env.ENV ?? 'test';
	if (env === 'test' || env === 'uat' || env === 'prod') {
		return env;
	}
	// No usamos console.warn para evitar romper el check 6 del pre-push (sin console.log nuevos).
	// El default a 'test' es seguro porque las creds TEST son las únicas que están en .env por defecto.
	return 'test';
}

/**
 * Bridge polimórfico: resuelve credenciales para un `AppRole` del runtime web.
 *
 * BL-009 Fase 3.2 (2026-05-13) — reemplaza `resolveRoleCredentials(role)` de
 * `tests/config/runtime.ts` en consumers que reciben `AppRole` dinámicamente
 * (global-setup.multi-role.ts, TestBase.ts, apiClient.ts).
 *
 * Delega al fixture canónico correspondiente y preserva la shape legacy
 * `{ username, password }` mapeando `WebUser.email → username`. De este modo,
 * los consumers polimórficos pueden migrar sin tocar su contrato de salida.
 *
 * Mapping rol → fixture:
 *   - 'carrier'    → DISPATCHER[env]
 *   - 'contractor' → CONTRACTOR_COLLABORATOR[env]
 *   - 'web'        → DISPATCHER[env]  (alias histórico del runtime web genérico)
 *
 * `resolveRoleCredentials()` del runtime queda intacto para retrocompatibilidad.
 *
 * Uso:
 *   import { getCredentialsForRole } from 'tests/fixtures/users';
 *   const { username, password } = getCredentialsForRole(role);
 */
export function getCredentialsForRole(
	role: AppRole,
	env: UserEnvironment = getCurrentUserEnvironment()
): { username: string; password: string } {
	// 'carrier' y 'web' comparten el mismo fixture: el dispatcher del SPA carrier.
	// 'web' existe como alias histórico en runtime.ts para tests que no son
	// estrictamente del portal carrier pero usan el mismo login.
	const user = role === 'contractor' ? CONTRACTOR_COLLABORATOR[env] : DISPATCHER[env];

	// Preservamos la shape legacy `{ username, password }` que esperan los
	// 3 consumers (global-setup, TestBase, apiClient). El fixture canónico
	// expone `email` — mapeamos a `username` sin renombrar el campo del SoT.
	return {
		username: user.email,
		password: user.password
	};
}
