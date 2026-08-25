/**
 * Passenger (Android App) — SoT de credenciales de login.
 *
 * IMPORTANTE — distinguir dos conceptos:
 *   1. "Passenger user" (este fixture) = credenciales de login a la app
 *      pasajero. Se usa para abrir sesión en Appium.
 *   2. "TestPassenger" (../passengers.ts) = pasajero de dominio (appPax,
 *      colaborador, empresaIndividuo) que aparece en el dropdown del
 *      portal carrier. NO tiene password.
 *
 * Ambos coexisten — uno describe el actor mobile que hace login, el otro
 * describe el cliente/colaborador que es parte del viaje.
 *
 * BL-009 Fase 2 — SoT skeleton. Scripts actuales (`passenger-login-and-dump`,
 * `PassengerNewTripScreen`) migran en Fase 3.
 *
 * Env vars consumidas (por ambiente), en orden de preferencia:
 *   test  → PASSENGER_EMAIL_TEST | USER_PASSENGER_TEST | PASSENGER_EMAIL | USER_PASSENGER
 *           PASSENGER_PASSWORD_TEST | PASS_PASSENGER_TEST | PASSENGER_PASSWORD | PASS_PASSENGER
 *   uat   → idem con sufijo UAT
 *   prod  → idem con sufijo PROD
 *
 * Los nombres `USER_PASSENGER` / `PASS_PASSENGER` se aceptan porque asi estan escritas las
 * credenciales en `.env.uat`, con el mismo patron `USER_<actor>` de `USER_CARRIER` y
 * `USER_CONTRACTOR`. No colisionan con PAX_WEB (`USER_PAX_*` / `PAX_USER`).
 *
 * Evidencia:
 *   - tests/mobile/appium/scripts/passenger-login-and-dump.ts → PASSENGER_EMAIL / PASSENGER_PASSWORD
 *   - tests/mobile/appium/passenger/PassengerNewTripScreen.ts:447 → process.env.PASSENGER_EMAIL
 *   - tests/mobile/appium/passenger/specs/pax-new-trip-blocked.spec.ts → requiere ambas vars
 *   - tests/e2e/gateway/flow2-passenger-driver/* → consumen las mismas vars
 *   - .env.test declara PASSENGER_EMAIL + PASSENGER_PASSWORD
 */

import { lazyEnv } from '../internal/env-resolver';
import type { EnvironmentMap, MobileUser } from '../types';

const LABEL = 'passenger (Android app)';

/**
 * Construye el fixture del pasajero para un ambiente.
 *
 * SOBRE LOS ALIAS `USER_PASSENGER` / `PASS_PASSENGER`. Estan en la lista porque es como estan
 * escritas las credenciales del pasajero en `.env.uat`, con el mismo patron `USER_<actor>` que ya
 * usan `USER_CARRIER` y `USER_CONTRACTOR` en ese mismo archivo. Antes de agregarlos NADIE en el
 * codigo leia esos nombres: las credenciales existian y el fixture no las veia, asi que un ambiente
 * correctamente configurado igual fallaba con "Missing env var". No colisionan con PAX_WEB, que lee
 * `USER_PAX_*` / `PAX_USER` — son actores distintos.
 *
 * EL ORDEN IMPORTA: primero lo especifico por ambiente, despues lo generico. `requireEnv` devuelve
 * el PRIMER candidato con valor y trata "" como ausente, asi que una clave declarada vacia no tapa
 * a la siguiente de la lista — que es exactamente el caso de `.env.uat`, donde `PASSENGER_EMAIL`
 * esta declarada vacia y `USER_PASSENGER` tiene el valor.
 */
function buildPassenger(envSuffix: 'TEST' | 'UAT' | 'PROD', environment: MobileUser['environment']): MobileUser {
	const emailEnv = lazyEnv(
		[`PASSENGER_EMAIL_${envSuffix}`, `USER_PASSENGER_${envSuffix}`, 'PASSENGER_EMAIL', 'USER_PASSENGER'],
		`${LABEL} [${environment}] email`
	);
	const passEnv = lazyEnv(
		[`PASSENGER_PASSWORD_${envSuffix}`, `PASS_PASSENGER_${envSuffix}`, 'PASSENGER_PASSWORD', 'PASS_PASSENGER'],
		`${LABEL} [${environment}] password`
	);

	return {
		role: 'passenger',
		environment,
		get email() {
			return emailEnv.value;
		},
		get password() {
			return passEnv.value;
		},
		notes:
			`Passenger app Android en ${environment}. ` +
			`No confundir con TestPassenger (dominio) de fixtures/users/passengers.ts. ` +
			`User histórico en TEST: emanuel.restrepo@yopmail.com (wallet con tarjetas paralelas — ver memoria).`
	};
}

/**
 * PASSENGER_APP_USER — fixture del rol passenger-app por ambiente.
 *
 * Nombre explícito "APP_USER" para que no colisione visualmente con
 * `PASSENGERS` (fixtures de dominio sin credenciales).
 *
 * Uso preferido:
 *   import { PASSENGER_APP_USER } from 'tests/fixtures/users';
 *   const { email, password } = PASSENGER_APP_USER.test;
 */
export const PASSENGER_APP_USER = {
	test: buildPassenger('TEST', 'test'),
	uat: buildPassenger('UAT', 'uat'),
	prod: buildPassenger('PROD', 'prod')
} as const satisfies EnvironmentMap<MobileUser>;
