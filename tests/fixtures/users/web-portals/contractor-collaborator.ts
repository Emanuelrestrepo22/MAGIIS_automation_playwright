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

import {
  ENV_SUFFIX_BY_ENVIRONMENT,
  lazyEnv,
  resolveActiveEnvironment,
  type EnvSuffix,
} from '../internal/env-resolver';
import type { EnvironmentMap, UserEnvironment, WebUser } from '../types';
import type { GatewayName } from '../../gateways/_shared';
import { GATEWAY_ENV_SUFFIX } from './gateway-suffix';

const LABEL = 'contractor collaborator (contractor portal)';

/**
 * Cadena de candidatos de credencial para el rol contractor, en orden de preferencia.
 *
 * Sin gateway (default, backward-compat): `[<PREFIX>_<ENV>, <PREFIX>]`
 * Con gateway:                            `[<PREFIX>_<GW>_<ENV>, <PREFIX>_<GW>, <PREFIX>_<ENV>, <PREFIX>]`
 */
function contractorCandidates(
  prefix: 'USER_CONTRACTOR' | 'PASS_CONTRACTOR',
  envSuffix: EnvSuffix,
  gateway?: GatewayName,
): string[] {
  if (!gateway) {
    return [`${prefix}_${envSuffix}`, prefix];
  }
  const gw = GATEWAY_ENV_SUFFIX[gateway];
  return [`${prefix}_${gw}_${envSuffix}`, `${prefix}_${gw}`, `${prefix}_${envSuffix}`, prefix];
}

function buildCollaborator(
  envSuffix: EnvSuffix,
  environment: WebUser['environment'],
  gateway?: GatewayName,
): WebUser {
  const emailEnv = lazyEnv(
    contractorCandidates('USER_CONTRACTOR', envSuffix, gateway),
    `${LABEL} [${environment}] email`,
  );
  const passEnv = lazyEnv(
    contractorCandidates('PASS_CONTRACTOR', envSuffix, gateway),
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

/**
 * getContractorCollaborator — resuelve el WebUser collaborator para un gateway y ambiente dados.
 *
 * - SIN `gateway`: cadena de candidatos idéntica al fixture `CONTRACTOR_COLLABORATOR`
 *   (`[USER_CONTRACTOR_<ENV>, USER_CONTRACTOR]`) → comportamiento default sin cambios.
 * - CON `gateway`: antepone `USER_CONTRACTOR_<GW>_<ENV>` y `USER_CONTRACTOR_<GW>`.
 *
 * @param gateway - pasarela objetivo (opcional). Omitido = comportamiento default.
 * @param environment - ambiente (opcional). Default = ambiente activo (`process.env.ENV`).
 */
export function getContractorCollaborator(
  gateway?: GatewayName,
  environment: UserEnvironment = resolveActiveEnvironment(),
): WebUser {
  return buildCollaborator(ENV_SUFFIX_BY_ENVIRONMENT[environment], environment, gateway);
}
