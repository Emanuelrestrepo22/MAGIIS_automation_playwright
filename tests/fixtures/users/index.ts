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
