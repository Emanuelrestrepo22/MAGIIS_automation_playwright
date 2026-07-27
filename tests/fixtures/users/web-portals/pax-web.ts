/**
 * Pax web portal user — SoT de credenciales.
 *
 * El "pax web" es el usuario del portal web del pasajero (wallet, alta de
 * viaje desde pax web). En el código legacy se consume vía
 * `getPortalCredentials('pax')` de `gatewayPortalRuntime.ts`, que lee
 * directamente `process.env.PAX_USER` / `PAX_PASS` (sin suffix por ambiente).
 *
 * BL-009 Fase 3.1 — SoT canónica. El fixture prefiere suffix por ambiente
 * (`USER_PAX_<ENV>` / `PASS_PAX_<ENV>`) y cae al genérico actual
 * (`USER_PAX` / `PASS_PAX`) y al legacy histórico (`PAX_USER` / `PAX_PASS`)
 * para no romper compatibilidad con los .env actuales.
 *
 * IMPORTANTE: este fixture es para el portal web pax, NO confundir con
 * `PASSENGER_APP_USER` (Appium mobile app). Son dos usuarios distintos.
 *
 * Env vars consumidas (por ambiente):
 *   test  → USER_PAX_TEST | USER_PAX | PAX_USER   + PASS_PAX_TEST | PASS_PAX | PAX_PASS
 *   uat   → USER_PAX_UAT  | USER_PAX | PAX_USER   + PASS_PAX_UAT  | PASS_PAX | PAX_PASS
 *   prod  → USER_PAX_PROD | USER_PAX | PAX_USER   + PASS_PAX_PROD | PASS_PAX | PAX_PASS
 *
 * Evidencia:
 *   - gatewayPortalRuntime.ts → getPortalCredentials('pax') exige PAX_USER + PAX_PASS
 *   - gateway.fixtures.ts → loginAsPax consume esas credenciales para el portal web pax
 */

import { lazyEnv } from '../internal/env-resolver';
import type { EnvironmentMap, WebUser } from '../types';

const LABEL = 'pax web portal user';

function buildPaxWeb(envSuffix: 'TEST' | 'UAT' | 'PROD', environment: WebUser['environment']): WebUser {
	const emailEnv = lazyEnv([`USER_PAX_${envSuffix}`, 'USER_PAX', 'PAX_USER'], `${LABEL} [${environment}] email`);
	const passEnv = lazyEnv([`PASS_PAX_${envSuffix}`, 'PASS_PAX', 'PAX_PASS'], `${LABEL} [${environment}] password`);

	return {
		role: 'pax-web',
		environment,
		get email() {
			return emailEnv.value;
		},
		get password() {
			return passEnv.value;
		},
		notes:
			`Pax user del portal web (wallet, alta viaje desde pax web) en ${environment}. ` +
			`Equivale a getPortalCredentials('pax') del gatewayPortalRuntime legacy.`
	};
}

/**
 * PAX_WEB — fixture del rol "pax web portal" por ambiente.
 *
 * Uso preferido:
 *   import { PAX_WEB } from 'tests/fixtures/users';
 *   const { email, password } = PAX_WEB.test;
 */
export const PAX_WEB = {
	test: buildPaxWeb('TEST', 'test'),
	uat: buildPaxWeb('UAT', 'uat'),
	prod: buildPaxWeb('PROD', 'prod')
} as const satisfies EnvironmentMap<WebUser>;
