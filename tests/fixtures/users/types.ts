/**
 * Types — Source of Truth de usuarios/credenciales para MAGIIS Playwright.
 *
 * BL-009 Fase 2 — estos tipos describen la forma canónica de los fixtures
 * de usuario con credenciales. El patrón evoluciona `TestPassenger` (que
 * describe pasajeros de negocio sin creds) separando la dimensión
 * "usuario de login" de la dimensión "pasajero de dominio".
 *
 * Reglas:
 *   - Cada fixture consume `process.env.*` en runtime (lazy) — nunca valores hardcoded.
 *   - `environment` es un tag informativo: el runtime activo (ENV) define qué fixture se usa.
 *   - `notes` es opcional y describe evidencia (de dónde salió el valor).
 */

/** Ambientes soportados para resolución de credenciales. */
export type UserEnvironment = 'test' | 'uat' | 'prod';

/** Roles de portal web (SPA carrier/contractor). */
export type PortalRole = 'dispatcher' | 'contractor-collaborator';

/** Roles de app mobile Android (Appium). */
export type MobileRole = 'driver' | 'passenger';

/**
 * Usuario de login para portales web (carrier, contractor).
 *
 * `email` / `password` se resuelven lazy desde `process.env.*` para que
 * rotar credenciales requiera SOLO cambiar el env file — nunca código.
 */
export interface WebUser {
  /** Rol semántico dentro del portal (dispatcher = carrier, collaborator = contractor). */
  role: PortalRole;
  /** Ambiente al que apunta este fixture. */
  environment: UserEnvironment;
  /** Resolver de email — lee `process.env.*` en cada llamada. */
  readonly email: string;
  /** Resolver de password — lee `process.env.*` en cada llamada. */
  readonly password: string;
  /** Evidencia / contexto humano. */
  notes?: string;
}

/**
 * Usuario de login para apps mobile (driver, passenger).
 *
 * Mismo contrato que `WebUser` pero con `role` mobile. Los selectores y
 * flows de login viven en `tests/mobile/appium/*` — este fixture solo
 * entrega credenciales.
 */
export interface MobileUser {
  role: MobileRole;
  environment: UserEnvironment;
  readonly email: string;
  readonly password: string;
  notes?: string;
}

/**
 * Tipo auxiliar para registros "por ambiente" (test/uat/prod).
 * Útil para exportar colecciones como `DISPATCHER` con las 3 variantes.
 */
export type EnvironmentMap<TUser> = Readonly<Record<UserEnvironment, TUser>>;
