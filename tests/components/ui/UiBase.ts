/**
 * KATA Architecture — Layer 2: UI Base Component.
 *
 * Clase base de todos los componentes UI (POMs KATA). Extiende TestContext para
 * heredar los drivers y el entorno. Usar la API nativa de Playwright vía `this.page`
 * (auto-wait incorporado — sin wrappers de espera).
 *
 * Contrato de errores KATA: métodos públicos fail-fast; utilidades privadas silenciosas.
 */

import type { Page } from '@playwright/test';
import type { TestContextOptions } from '@TestContext';

import { TestContext } from '@TestContext';

export class UiBase extends TestContext {
	/** Base URL del entorno (de BASE_URL). Usar con buildUrl() para URLs completas. */
	readonly baseUrl: string;

	constructor(options: TestContextOptions) {
		super(options);
		this.baseUrl = process.env.BASE_URL ?? '';
	}

	/**
	 * Accesor de Page. Fail-fast si no hay page (ej. en un test API-only).
	 */
	get page(): Page {
		if (!this._page) {
			throw new Error(
				'Page no disponible. UiBase requiere una instancia page. ' +
					'Asegurate de usar un fixture UI (ui o test), no api.'
			);
		}
		return this._page;
	}

	/**
	 * Construye una URL completa desde un path usando baseUrl.
	 * Para page.goto() preferí paths relativos — Playwright resuelve baseURL.
	 */
	buildUrl(path: string): string {
		const base = this.baseUrl.replace(/\/$/, '');
		const cleanPath = path.startsWith('/') ? path : `/${path}`;
		return `${base}${cleanPath}`;
	}
}
