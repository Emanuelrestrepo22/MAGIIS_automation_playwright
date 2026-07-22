/**
 * KATA Architecture — Layer 1: Test Context.
 *
 * Fundación compartida por todos los componentes (UiBase, ApiBase). Centraliza
 * los drivers de Playwright (page, request) inyectados desde los fixtures y el
 * entorno activo.
 *
 * Adaptación magiis-playwright: NO depende de `@variables`/DataFactory (que no
 * existen en este repo). El entorno se resuelve de `TEST_ENV`/`ENV` (default `test`),
 * consistente con `tests/config/runtime.ts`.
 */

import type { APIRequestContext, Page } from '@playwright/test';

export type TestEnv = string;

export interface TestContextOptions {
	/** Instancia Page de Playwright (requerida en tests UI). */
	page?: Page;
	/** Instancia APIRequestContext de Playwright (requerida en tests API). */
	request?: APIRequestContext;
	/** Entorno a usar (default: se resuelve de TEST_ENV / ENV). */
	environment?: TestEnv;
}

/** Resuelve el entorno activo desde el env (default `test`), alineado con config/runtime. */
export function resolveEnv(): TestEnv {
	return process.env.TEST_ENV ?? process.env.ENV ?? 'test';
}

export class TestContext {
	/** Page de Playwright — disponible en tests UI. */
	protected readonly _page?: Page;

	/** APIRequestContext de Playwright — disponible en tests API. */
	protected readonly _request?: APIRequestContext;

	/** Entorno actual (test, uat, prod). */
	readonly env: TestEnv;

	constructor(options: TestContextOptions = {}) {
		this._page = options.page;
		this._request = options.request;
		this.env = options.environment ?? resolveEnv();
	}
}
