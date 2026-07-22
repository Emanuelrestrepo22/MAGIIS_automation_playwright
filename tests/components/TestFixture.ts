/**
 * KATA Architecture — Layer 4: Unified Test Fixture.
 *
 * Punto de entrada para todos los tipos de test. Combina los fixtures UI, API y DB
 * (trifuerza) sobre el `test` de Playwright:
 *   - `test`: fixture completo (UI + API) para E2E.
 *   - `ui`:   solo UI (abre browser).
 *   - `api`:  solo API (NO abre browser — los fixtures de Playwright son lazy).
 *   - `db`:   capa DB (OracleDb lazy, read-only, env-aware).
 *
 * Todos los fixtures comparten el mismo context de TestContext → los drivers de UI y
 * API son consistentes en tests híbridos.
 *
 * Uso E2E:
 *   test('example', async ({ test }) => {
 *     await test.ui.threeDs.completeSuccess();
 *   });
 *
 * Uso API-only:
 *   test('example', async ({ api }) => { ... });
 */

import type { APIRequestContext, Page } from '@playwright/test';
import type { TestEnv } from '@TestContext';

import { test as base, expect } from '@playwright/test';

import { ApiFixture } from '@ApiFixture';
import { OracleDb } from '@db/OracleDb';
import { TestContext } from '@TestContext';
import { UiFixture } from '@UiFixture';

class TestFixture extends TestContext {
	/** Fixture API — requests HTTP. */
	api: ApiFixture;

	/** Fixture UI — interacciones de browser. */
	ui: UiFixture;

	constructor(page: Page, request: APIRequestContext, environment?: TestEnv) {
		super({ page, request, environment });

		const options = { page, request, environment: this.env };
		this.api = new ApiFixture(options);
		this.ui = new UiFixture(options);
	}

	/** Acceso directo al Page de Playwright. */
	get page(): Page {
		if (!this._page) throw new Error('Page no disponible.');
		return this._page;
	}
}

export const test = base.extend<{
	test: TestFixture;
	api: ApiFixture;
	ui: UiFixture;
	db: OracleDb;
}>({
	// Fixture completo UI + API (E2E).
	test: async ({ page, request }, use) => {
		await use(new TestFixture(page, request));
	},

	// UI-only (abre browser).
	ui: async ({ page, request }, use) => {
		await use(new UiFixture({ page, request }));
	},

	// API-only (NO abre browser — fixtures lazy de Playwright).
	api: async ({ request }, use) => {
		await use(new ApiFixture({ request }));
	},

	// DB (trifuerza). LAZY + env-aware vía OracleDb.
	// eslint-disable-next-line no-empty-pattern
	db: async ({}, use) => {
		await use(new OracleDb());
	}
});

export { ApiFixture, expect, TestFixture, UiFixture };
