/**
 * @deprecated BL-009 Fase 4 (2026-05-13) — re-export legacy.
 *
 * El SoT canónico de `PASSENGERS` y `TestPassenger` vive ahora en
 * `tests/fixtures/users/passengers.ts` (expuesto vía el barrel
 * `tests/fixtures/users`).
 *
 * Este archivo se preserva como thin re-export para no romper los specs
 * existentes que aún importan desde `features/gateway-pg/data/passengers`.
 * Imports nuevos deben apuntar a `tests/fixtures/users`:
 *
 *   import { PASSENGERS, type TestPassenger } from 'tests/fixtures/users';
 *
 * TODO BL-009 Fase 5+: migrar los specs que aún usan este path al barrel
 * canónico y eliminar este archivo.
 */

export { PASSENGERS, type TestPassenger } from '../../../fixtures/users/passengers';
