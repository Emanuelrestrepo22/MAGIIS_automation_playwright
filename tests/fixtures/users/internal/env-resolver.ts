/**
 * env-resolver — helper interno de los fixtures de usuario.
 *
 * Encapsula la lectura de variables de entorno con:
 *   - resolución lazy (cada acceso al fixture re-evalúa process.env)
 *   - fallback entre variables (por ej. USER_CARRIER → CARRIER_USER)
 *   - normalización de strings vacíos ("") → undefined
 *   - error consistente cuando la variable es required y no está presente
 *
 * NO es parte del contrato público de `tests/fixtures/users/`.
 * Importar solo desde archivos dentro de este directorio.
 */

import type { UserEnvironment } from '../types';

/** Sufijo de credencial por ambiente (`USER_CARRIER_TEST`, `PASS_CONTRACTOR_UAT`, …). */
export type EnvSuffix = 'TEST' | 'UAT' | 'PROD';

/**
 * SoT único del mapeo ambiente → sufijo de env-file.
 * Antes estaba inline en cada fixture (`buildDispatcher('TEST', 'test')`).
 */
export const ENV_SUFFIX_BY_ENVIRONMENT = {
  test: 'TEST',
  uat: 'UAT',
  prod: 'PROD',
} as const satisfies Record<UserEnvironment, EnvSuffix>;

/**
 * Resuelve el ambiente activo desde `process.env.ENV`.
 * Default seguro a 'test' si está ausente o tiene un valor desconocido.
 *
 * SoT único de la resolución de ambiente: consumido por los getters de fixture
 * (`getDispatcher` / `getContractorCollaborator`) y por `getCurrentUserEnvironment`
 * del barrel. No usa `console.warn` para no romper el check 6 del pre-push.
 */
export function resolveActiveEnvironment(): UserEnvironment {
  const env = process.env.ENV ?? 'test';
  if (env === 'test' || env === 'uat' || env === 'prod') {
    return env;
  }
  return 'test';
}

/** Devuelve el valor trimeado o undefined si está vacío / ausente. */
function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Lee la primera variable disponible de la lista. Throw con mensaje
 * consistente si ninguna está definida.
 *
 * @param candidates - variables en orden de preferencia (primaria → fallbacks)
 * @param label - descriptor humano del fixture (para el mensaje de error)
 */
export function requireEnv(candidates: readonly string[], label: string): string {
  for (const name of candidates) {
    const value = normalize(process.env[name]);
    if (value) {
      return value;
    }
  }

  const joined = candidates.join(' or ');
  throw new Error(
    `[fixtures/users] Missing env var ${joined} for ${label}. ` +
      `Set it in the active env file (ENV=${process.env.ENV ?? 'test'}).`,
  );
}

/**
 * Crea un getter que resuelve la variable cada vez que se lee.
 * Permite que `fixture.email` refleje cambios en process.env entre tests
 * (p. ej. si un test modifica ENV en setup).
 */
export function lazyEnv(candidates: readonly string[], label: string): { readonly value: string } {
  return {
    get value() {
      return requireEnv(candidates, label);
    },
  };
}
