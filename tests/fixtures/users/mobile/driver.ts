/**
 * Driver (Android App) — SoT de credenciales.
 *
 * Driver es el actor mobile que acepta viajes y simula ruta GPS en la
 * suite E2E híbrida. Hoy las credenciales viven sueltas en scripts y en
 * el harness (`DRIVER_EMAIL` / `DRIVER_PASSWORD`), sin ambiente explícito.
 *
 * BL-009 Fase 2 — SoT skeleton. La adopción en `appiumRuntime.ts` y en
 * scripts `tests/mobile/appium/scripts/*` queda para Fase 3.
 *
 * Env vars consumidas (por ambiente):
 *   test  → DRIVER_EMAIL_TEST | DRIVER_EMAIL          + DRIVER_PASSWORD_TEST | DRIVER_PASSWORD
 *   uat   → DRIVER_EMAIL_UAT  | DRIVER_EMAIL          + DRIVER_PASSWORD_UAT  | DRIVER_PASSWORD
 *   prod  → DRIVER_EMAIL_PROD | DRIVER_EMAIL          + DRIVER_PASSWORD_PROD | DRIVER_PASSWORD
 *
 * Evidencia:
 *   - tests/mobile/appium/scripts/driver-login-smoke.ts → process.env.DRIVER_EMAIL / DRIVER_PASSWORD
 *   - tests/mobile/appium/scripts/driver-login-password-only.ts → DRIVER_PASSWORD fallback '123'
 *   - tests/mobile/appium/scripts/dump-after-login.ts → usa las mismas vars
 *   - .env.test declara DRIVER_EMAIL + DRIVER_PASSWORD
 */

import { lazyEnv } from '../internal/env-resolver';
import type { EnvironmentMap, MobileUser } from '../types';

const LABEL = 'driver (Android app)';

function buildDriver(envSuffix: 'TEST' | 'UAT' | 'PROD', environment: MobileUser['environment']): MobileUser {
  const emailEnv = lazyEnv([`DRIVER_EMAIL_${envSuffix}`, 'DRIVER_EMAIL'], `${LABEL} [${environment}] email`);
  const passEnv = lazyEnv(
    [`DRIVER_PASSWORD_${envSuffix}`, 'DRIVER_PASSWORD'],
    `${LABEL} [${environment}] password`,
  );

  return {
    role: 'driver',
    environment,
    get email() {
      return emailEnv.value;
    },
    get password() {
      return passEnv.value;
    },
    notes:
      `Driver app Android en ${environment}. ` +
      `Scripts de soporte: tests/mobile/appium/scripts/driver-login-*.ts. ` +
      `Package del ambiente vive en appiumRuntime.ts → APP_PACKAGES.`,
  };
}

/**
 * DRIVER — fixture del rol driver por ambiente.
 *
 * Uso preferido:
 *   import { DRIVER } from 'tests/fixtures/users';
 *   const { email, password } = DRIVER.test;
 */
export const DRIVER = {
  test: buildDriver('TEST', 'test'),
  uat: buildDriver('UAT', 'uat'),
  prod: buildDriver('PROD', 'prod'),
} as const satisfies EnvironmentMap<MobileUser>;
