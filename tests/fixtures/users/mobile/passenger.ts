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
 * Env vars consumidas (por ambiente):
 *   test  → PASSENGER_EMAIL_TEST | PASSENGER_EMAIL   + PASSENGER_PASSWORD_TEST | PASSENGER_PASSWORD
 *   uat   → PASSENGER_EMAIL_UAT  | PASSENGER_EMAIL   + PASSENGER_PASSWORD_UAT  | PASSENGER_PASSWORD
 *   prod  → PASSENGER_EMAIL_PROD | PASSENGER_EMAIL   + PASSENGER_PASSWORD_PROD | PASSENGER_PASSWORD
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

function buildPassenger(envSuffix: 'TEST' | 'UAT' | 'PROD', environment: MobileUser['environment']): MobileUser {
  const emailEnv = lazyEnv(
    [`PASSENGER_EMAIL_${envSuffix}`, 'PASSENGER_EMAIL'],
    `${LABEL} [${environment}] email`,
  );
  const passEnv = lazyEnv(
    [`PASSENGER_PASSWORD_${envSuffix}`, 'PASSENGER_PASSWORD'],
    `${LABEL} [${environment}] password`,
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
      `User histórico en TEST: emanuel.restrepo@yopmail.com (wallet con tarjetas paralelas — ver memoria).`,
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
  prod: buildPassenger('PROD', 'prod'),
} as const satisfies EnvironmentMap<MobileUser>;
