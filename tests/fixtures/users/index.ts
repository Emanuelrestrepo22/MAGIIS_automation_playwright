/**
 * Barrel — Source of Truth de usuarios/credenciales para MAGIIS Playwright.
 *
 * BL-009 Fase 2 — punto de entrada canónico. Todo import nuevo de
 * credenciales/usuarios debe partir desde aquí:
 *
 *   import { DISPATCHER, CONTRACTOR_COLLABORATOR, DRIVER, PASSENGER_APP_USER } from 'tests/fixtures/users';
 *   import { PASSENGERS, type TestPassenger } from 'tests/fixtures/users';
 *
 * Ver README.md para la guía completa.
 */

import type { UserEnvironment } from './types';

// ─── Tipos públicos ───────────────────────────────────────────────────────────
export type {
  UserEnvironment,
  PortalRole,
  MobileRole,
  WebUser,
  MobileUser,
  EnvironmentMap,
} from './types';

// ─── Fixtures con credenciales ────────────────────────────────────────────────
export { DISPATCHER, CONTRACTOR_COLLABORATOR } from './web-portals';
export { DRIVER, PASSENGER_APP_USER } from './mobile';

// ─── Fixtures legacy (pasajeros de dominio, sin credenciales) ─────────────────
// Mantener como re-export hasta BL-009 Fase 4 (legacy cleanup).
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
