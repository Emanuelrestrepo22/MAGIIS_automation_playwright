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

import { ENV_SUFFIX_BY_ENVIRONMENT, lazyEnv, resolveActiveEnvironment, type EnvSuffix } from '../internal/env-resolver';
import type { EnvironmentMap, UserEnvironment, WebUser } from '../types';
import type { GatewayName } from '../../gateways/_shared';
import { GATEWAY_ENV_SUFFIX } from './gateway-suffix';

const LABEL = 'dispatcher (carrier portal)';

/**
 * Cadena de candidatos de credencial para el rol carrier, en orden de preferencia.
 *
 * Sin gateway (default, backward-compat): `[<PREFIX>_<ENV>, <PREFIX>]`
 * Con gateway:                            `[<PREFIX>_<GW>_<ENV>, <PREFIX>_<GW>, <PREFIX>_<ENV>, <PREFIX>]`
 */
function carrierCandidates(
	prefix: 'USER_CARRIER' | 'PASS_CARRIER',
	envSuffix: EnvSuffix,
	gateway?: GatewayName
): string[] {
	if (!gateway) {
		return [`${prefix}_${envSuffix}`, prefix];
	}
	const gw = GATEWAY_ENV_SUFFIX[gateway];
	return [`${prefix}_${gw}_${envSuffix}`, `${prefix}_${gw}`, `${prefix}_${envSuffix}`, prefix];
}

function buildDispatcher(envSuffix: EnvSuffix, environment: WebUser['environment'], gateway?: GatewayName): WebUser {
	const emailEnv = lazyEnv(carrierCandidates('USER_CARRIER', envSuffix, gateway), `${LABEL} [${environment}] email`);
	const passEnv = lazyEnv(
		carrierCandidates('PASS_CARRIER', envSuffix, gateway),
		`${LABEL} [${environment}] password`
	);

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
			`Equivale a resolveRoleCredentials('carrier') + getPortalCredentials('carrier').`
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
	prod: buildDispatcher('PROD', 'prod')
} as const satisfies EnvironmentMap<WebUser>;

/**
 * getDispatcher — resuelve el WebUser dispatcher para un gateway y ambiente dados.
 *
 * - SIN `gateway`: cadena de candidatos idéntica al fixture `DISPATCHER`
 *   (`[USER_CARRIER_<ENV>, USER_CARRIER]`) → comportamiento default sin cambios.
 * - CON `gateway`: antepone `USER_CARRIER_<GW>_<ENV>` y `USER_CARRIER_<GW>`.
 *
 * @param gateway - pasarela objetivo (opcional). Omitido = comportamiento default.
 * @param environment - ambiente (opcional). Default = ambiente activo (`process.env.ENV`).
 */
export function getDispatcher(
	gateway?: GatewayName,
	environment: UserEnvironment = resolveActiveEnvironment()
): WebUser {
	return buildDispatcher(ENV_SUFFIX_BY_ENVIRONMENT[environment], environment, gateway);
}
