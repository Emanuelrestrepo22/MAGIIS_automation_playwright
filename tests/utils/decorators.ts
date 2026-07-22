/**
 * KATA Architecture — @atc / @step decorators.
 *
 * `@atc` conecta un método (mini-flujo atómico) con un Test Case de Jira/Xray y
 * lo envuelve en un test.step con logging + metadata Allure. `@step` traza helpers
 * públicos de Layer 3 en el reporter.
 *
 * Formato TC39 Stage 3 (soportado nativo por TS 5+ SIN experimentalDecorators, y
 * por el transform de Playwright/esbuild en runtime).
 *
 * Adaptación magiis-playwright: sin dependencia de `@variables` (no hay config
 * compartida de TMS acá) y sin persistencia NDJSON (no hay KataReporter). Se conserva
 * la integración Allure (allure-js-commons ya está instalado).
 */

import { test } from '@playwright/test';
import * as allure from 'allure-js-commons';
import { ContentType } from 'allure-js-commons';

export interface AtcOptions {
	/** Si true, continúa la ejecución aunque el método falle (default false). */
	softFail?: boolean;
	/** Descripción para el reporte Allure. */
	description?: string;
	/** Severidad Allure. */
	severity?: 'blocker' | 'critical' | 'normal' | 'minor' | 'trivial';
}

/**
 * @atc — marca un método como Acceptance Test Case ligado a un Test de Jira/Xray.
 *
 * @param testId ID del Test (ej. 'MG-152').
 * @param options Configuración opcional (softFail, severity, description).
 *
 * @example
 * ```typescript
 * @atc('MG-152', { severity: 'critical' })
 * async completeChallengeSuccess() {
 *   await this.completeButton.click();
 *   await expect(this.overlay).toBeHidden();
 * }
 * ```
 */
export function atc(testId: string, options: AtcOptions = {}) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- flexibilidad del decorador con strict
	return function <T extends (...args: any[]) => Promise<any>>(
		originalMethod: T,
		context: ClassMethodDecoratorContext
	): T {
		const methodName = String(context.name);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- coincide con la firma genérica T
		async function replacement(this: { constructor: { name: string } }, ...args: any[]) {
			const startTime = Date.now();

			try {
				allure.label('testId', testId);
				if (options.description) allure.description(options.description);
				if (options.severity) allure.severity(options.severity);
			} catch {
				/* Allure puede no estar disponible en todos los contextos */
			}

			try {
				const stepTitle = `ATC [${testId}]: ${methodName}${formatArgs(args)}`;
				const returnValue = await test.step(stepTitle, async () => originalMethod.apply(this, args));
				console.log(`✅ [${testId}] ${methodName} - PASS (${Date.now() - startTime}ms)`);
				return returnValue;
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				console.log(`❌ [${testId}] ${methodName} - FAIL: ${message}`);

				if (options.softFail) {
					console.log(`⚠️ [${testId}] Soft fail activo — continúa la ejecución`);
					try {
						await allure.attachment('Soft Fail Error', message, ContentType.TEXT);
					} catch {
						/* Allure puede no estar disponible */
					}
					return undefined;
				}
				throw error;
			}
		}

		return replacement as T;
	};
}

/**
 * @step — traza un helper público de Layer 3 dentro de un test.step (aparece en el reporter).
 * Usar en queries read-only. NO usar sobre métodos @atc ni sobre helpers de Layer 2.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- flexibilidad del decorador con strict
export function step<T extends (...args: any[]) => Promise<any>>(
	originalMethod: T,
	context: ClassMethodDecoratorContext
): T {
	const methodName = String(context.name);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- coincide con la firma genérica T
	async function replacement(this: unknown, ...args: any[]) {
		return test.step(`${methodName}${formatArgs(args)}`, async () => originalMethod.apply(this, args));
	}

	return replacement as T;
}

// ============================================
// Formateo de parámetros (para títulos de step)
// ============================================

const SENSITIVE_KEYS = new Set(['password', 'token', 'secret', 'authorization', 'access_token']);
const MAX_STRING_LEN = 80;
const MAX_OBJECT_LEN = 120;

function formatValue(value: unknown, key?: string): string {
	if (key && SENSITIVE_KEYS.has(key.toLowerCase())) return '"***"';
	if (value === null) return 'null';
	if (value === undefined) return 'undefined';
	if (typeof value === 'function') return '[Function]';
	if (typeof value === 'string')
		return value.length > MAX_STRING_LEN ? `"${value.slice(0, MAX_STRING_LEN)}..."` : `"${value}"`;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	if (Array.isArray(value)) return `[Array(${value.length})]`;

	if (typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>);
		const formatted = entries
			.slice(0, 5)
			.map(([k, v]) => `${k}: ${formatValue(v, k)}`)
			.join(', ');
		const suffix = entries.length > 5 ? ', ...' : '';
		const result = `{ ${formatted}${suffix} }`;
		return result.length > MAX_OBJECT_LEN ? `${result.slice(0, MAX_OBJECT_LEN)}...}` : result;
	}

	return String(value);
}

function formatArgs(args: unknown[]): string {
	if (args.length === 0) return '()';
	return `(${args.map(a => formatValue(a)).join(', ')})`;
}
