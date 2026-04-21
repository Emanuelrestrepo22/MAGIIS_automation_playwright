/**
 * Contractor collaborator — SoT de credenciales.
 *
 * El "collaborator" es el usuario del portal Contractor (cliente empresa
 * que gestiona sus propios colaboradores). Equivale al rol 'contractor'
 * del runtime web: `resolveRoleCredentials('contractor')`.
 *
 * BL-009 Fase 2 — SoT skeleton. NO se adopta todavía en runtime/fixtures;
 * la adopción es Fase 3 (ver README.md de este directorio).
 *
 * Env vars consumidas (por ambiente):
 *   test  → USER_CONTRACTOR_TEST | USER_CONTRACTOR   + PASS_CONTRACTOR_TEST | PASS_CONTRACTOR
 *   uat   → USER_CONTRACTOR_UAT  | USER_CONTRACTOR   + PASS_CONTRACTOR_UAT  | PASS_CONTRACTOR
 *   prod  → USER_CONTRACTOR_PROD | USER_CONTRACTOR   + PASS_CONTRACTOR_PROD | PASS_CONTRACTOR
 *
 * Evidencia:
 *   - runtime.ts → resolveRoleCredentials('contractor') lee USER_CONTRACTOR / PASS_CONTRACTOR
 *   - gateway.fixtures.ts → loginAsContractor usa exactamente ese resolver
 *   - .env.test declara USER_CONTRACTOR + PASS_CONTRACTOR (UAT/PROD todavía no).
 */

import { lazyEnv } from '../internal/env-resolver';
import type { EnvironmentMap, WebUser } from '../types';

const LABEL = 'contractor collaborator (contractor portal)';

function buildCollaborator(envSuffix: 'TEST' | 'UAT' | 'PROD', environment: WebUser['environment']): WebUser {
  const emailEnv = lazyEnv(
    [`USER_CONTRACTOR_${envSuffix}`, 'USER_CONTRACTOR'],
    `${LABEL} [${environment}] email`,
  );
  const passEnv = lazyEnv(
    [`PASS_CONTRACTOR_${envSuffix}`, 'PASS_CONTRACTOR'],
    `${LABEL} [${environment}] password`,
  );

  return {
    role: 'contractor-collaborator',
    environment,
    get email() {
      return emailEnv.value;
    },
    get password() {
      return passEnv.value;
    },
    notes:
      `Usuario "collaborator" del portal Contractor en ${environment}. ` +
      `Equivale a resolveRoleCredentials('contractor'). ` +
      `Cliente de referencia en TEST: "fast car" (ver features/gateway-pg/data/passengers.ts).`,
  };
}

/**
 * CONTRACTOR_COLLABORATOR — fixture del rol contractor por ambiente.
 *
 * Uso preferido:
 *   import { CONTRACTOR_COLLABORATOR } from 'tests/fixtures/users';
 *   const { email, password } = CONTRACTOR_COLLABORATOR.test;
 */
export const CONTRACTOR_COLLABORATOR = {
  test: buildCollaborator('TEST', 'test'),
  uat: buildCollaborator('UAT', 'uat'),
  prod: buildCollaborator('PROD', 'prod'),
} as const satisfies EnvironmentMap<WebUser>;
