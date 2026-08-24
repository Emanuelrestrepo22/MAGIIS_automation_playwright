/**
 * Carga del archivo de entorno para la capa móvil.
 *
 * POR QUÉ EXISTE. La capa Appium leía `process.env` directo, sin cargar ningún `.env.*`.
 * Consecuencia medida: `.env.test` declaraba `APPIUM_SERVER_URL`, `ANDROID_DEVICE_NAME`,
 * `ANDROID_PLATFORM_VERSION` y `ANDROID_DRIVER_APP_PACKAGE` que **nunca llegaban al proceso**,
 * y `.env.uat` no declaraba ninguna. Toda corrida móvil dependía de lo que el operador hubiera
 * exportado a mano en su terminal, o de defaults hardcodeados en el código.
 *
 * Eso convierte al ambiente en algo no reproducible: dos personas corriendo `ENV=uat` obtienen
 * configuraciones distintas según lo que tengan en la shell.
 *
 * Este módulo espeja la convención que ya usa la capa web (`tests/config/runtime.ts` →
 * `getEnvFile()`): `ENV_FILE` si está, si no `.env.<ENV>`.
 *
 * NO PISA lo que ya esté en `process.env` (`override: false`, el default de dotenv): una variable
 * exportada en la shell sigue ganando sobre el archivo. Así el cambio es aditivo y no altera el
 * comportamiento de ninguna corrida existente que hoy dependa de la shell.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// tests/mobile/appium/config/ → 4 niveles arriba es la raíz del repo.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

let loaded = false;

/** Nombre del archivo de entorno para el ambiente activo. Espeja `runtime.ts:getEnvFile()`. */
export function getMobileEnvFile(): string {
	return process.env.ENV_FILE ?? `.env.${process.env.ENV ?? 'test'}`;
}

/**
 * Carga el archivo de entorno una sola vez por proceso. Idempotente: varios módulos de la capa
 * móvil pueden llamarla sin costo. Si el archivo no existe no falla — la validación de variables
 * requeridas es responsabilidad de quien las lee (`readRequiredEnv`), que da un error mucho más
 * específico que "falta el archivo".
 */
export function loadMobileEnvFile(): void {
	if (loaded) return;
	loaded = true;
	dotenv.config({ path: path.resolve(REPO_ROOT, getMobileEnvFile()) });
}
