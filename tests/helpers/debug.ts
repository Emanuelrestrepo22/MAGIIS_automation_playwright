/**
 * tests/helpers/debug.ts
 * Utilidades de debugging condicional.
 * Detectado en codebase: console.log dispersos sin namespace en
 * auth/specs/, gateway-pg/helpers/, gateway-pg/specs/ — centralizar aquí.
 * Uso: establecer DEBUG=helpers,auth,gateway en .env.test para activar logs.
 */

import fs from 'fs';
import path from 'path';
import type { Page } from '@playwright/test';

/**
 * Emite log solo si process.env.DEBUG incluye el namespace `ns`.
 * Formato: [ns] ...args
 * Ejemplo: DEBUG=helpers,auth pnpm test
 */
export function debugLog(ns: string, ...args: unknown[]): void {
	const debugEnv = process.env['DEBUG'] ?? '';
	if (debugEnv === '*' || debugEnv.split(',').includes(ns)) {
		console.log(`[${ns}]`, ...args);
	}
}

/**
 * Captura estado DOM completo a evidence/debug/<label>/:
 * - screenshot PNG
 * - snapshot HTML del body
 * - console logs recientes (si page tiene listener activo)
 * No falla el test si la carpeta no se puede crear.
 */
export async function captureDOMState(page: Page, label: string): Promise<void> {
	const dir = path.join('evidence', 'debug', label);
	try {
		fs.mkdirSync(dir, { recursive: true });
		await page.screenshot({ path: path.join(dir, 'screenshot.png'), fullPage: true }).catch(() => {});
		const html = await page.evaluate(() => document.body.innerHTML).catch(() => '');
		fs.writeFileSync(path.join(dir, 'body.html'), html, 'utf-8');
		debugLog('debug', `captureDOMState → ${dir}`);
	} catch {
		// No bloquear el test por fallo en captura de debug
	}
}

/**
 * Mide la duración de un step async y la loguea con debugLog.
 * Retransparenta el valor de retorno de `fn`.
 */
export async function timeStep<T>(label: string, fn: () => Promise<T>): Promise<T> {
	const start = Date.now();
	try {
		const result = await fn();
		debugLog('perf', `${label} → ${Date.now() - start}ms`);
		return result;
	} catch (err) {
		debugLog('perf', `${label} → FAILED after ${Date.now() - start}ms`);
		throw err;
	}
}
