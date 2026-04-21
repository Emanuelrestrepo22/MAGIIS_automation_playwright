/**
 * Dispatcher (Carrier portal) — SoT de credenciales.
 *
 * El "dispatcher" es el rol humano del portal Carrier: crea viajes,
 * vincula tarjetas, gestiona flotas. En el código legacy este mismo
 * usuario se consume vía `resolveRoleCredentials('carrier')` (runtime.ts)
 * y `getPortalCredentials('carrier')` (gatewayPortalRuntime.ts).
 *
 * BL-009 Fase 2 — SoT skeleton. NO se adopta todavía en runtime/fixtures;
 * la adopción es Fase 3 (ver README.md de este directorio).
 *
 * Env vars consumidas (por ambiente):
 *   test  → USER_CARRIER_TEST | USER_CARRIER           + PASS_CARRIER_TEST | PASS_CARRIER
 *   uat   → USER_CARRIER_UAT  | USER_CARRIER           + PASS_CARRIER_UAT  | PASS_CARRIER
 *   prod  → USER_CARRIER_PROD | USER_CARRIER           + PASS_CARRIER_PROD | PASS_CARRIER
 *
 * Fallback genérico (`USER_CARRIER` / `PASS_CARRIER`) existe para mantener
 * compatibilidad con los .env actuales — cuando BL-009 Fase 1 rote creds
 * PROD y separe archivos por ambiente, el fallback deja de ser necesario.
 *
 * Evidencia:
 *   - runtime.ts → resolveRoleCredentials('carrier') lee USER_CARRIER / PASS_CARRIER
 *   - gatewayPortalRuntime.ts → getPortalCredentials('carrier') con fallback CARRIER_USER
 *   - .env.test / .env.uat / .env.prod declaran USER_CARRIER + PASS_CARRIER
 */

import { lazyEnv } from '../internal/env-resolver';
import type { EnvironmentMap, WebUser } from '../types';

const LABEL = 'dispatcher (carrier portal)';

function buildDispatcher(envSuffix: 'TEST' | 'UAT' | 'PROD', environment: WebUser['environment']): WebUser {
  const emailEnv = lazyEnv([`USER_CARRIER_${envSuffix}`, 'USER_CARRIER'], `${LABEL} [${environment}] email`);
  const passEnv = lazyEnv([`PASS_CARRIER_${envSuffix}`, 'PASS_CARRIER'], `${LABEL} [${environment}] password`);

  return {
    role: 'dispatcher',
    environment,
    get email() {
      return emailEnv.value;
    },
    get password() {
      return passEnv.value;
    },
    notes:
      `Dispatcher del portal Carrier en ${environment}. ` +
      `Equivale a resolveRoleCredentials('carrier') + getPortalCredentials('carrier').`,
  };
}

/**
 * DISPATCHER — fixture del rol "carrier dispatcher" por ambiente.
 *
 * Uso preferido:
 *   import { DISPATCHER } from 'tests/fixtures/users';
 *   const { email, password } = DISPATCHER.test;
 *
 * Los getters son lazy — no se dispara error hasta que realmente se lee
 * `email` o `password`. Esto permite importar el fixture en archivos que
 * no necesariamente usan TEST/UAT/PROD al mismo tiempo.
 */
export const DISPATCHER = {
  test: buildDispatcher('TEST', 'test'),
  uat: buildDispatcher('UAT', 'uat'),
  prod: buildDispatcher('PROD', 'prod'),
} as const satisfies EnvironmentMap<WebUser>;
