/**
 * tests/helpers/browser.ts
 * Wrappers reutilizables sobre la Playwright API cross-feature.
 * Patrones detectados en codebase:
 * - waitForLoadState('networkidle') en empresa-hold-no3ds.spec.ts:354
 * - waitForTimeout(500/1000) para esperar que la URL se estabilice (NewTravelPageBase)
 * - modal 3DS que abre nueva pestaña (ThreeDSModal.ts)
 */

import { type BrowserContext, type Page } from '@playwright/test';

/**
 * Espera hasta que la URL coincida con el patrón y no cambie por `stableMs` ms.
 * Útil para shells SPA que hacen múltiples redirects antes de asentarse.
 */
export async function waitForStableURL(page: Page, urlPattern: string | RegExp, stableMs = 1_000, timeout = 15_000): Promise<void> {
	const deadline = Date.now() + timeout;

	while (Date.now() < deadline) {
		const current = page.url();
		const matches = typeof urlPattern === 'string' ? current.includes(urlPattern) : urlPattern.test(current);

		if (matches) {
			// Verificar que la URL no cambia en el próximo intervalo
			await page.waitForTimeout(stableMs);
			const after = page.url();
			if (after === current) return;
		}

		await page.waitForTimeout(200);
	}

	throw new Error(`waitForStableURL: URL no se estabilizó en "${urlPattern}" dentro de ${timeout}ms. URL actual: ${page.url()}`);
}

/**
 * Cierra todas las pestañas extra que no sean la primera del contexto.
 * Útil después de flujos 3DS o popups que abren nueva pestaña.
 */
export async function closeExtraTabs(context: BrowserContext): Promise<void> {
	const pages = context.pages();
	// Mantener solo la primera pestaña
	for (const pg of pages.slice(1)) {
		await pg.close().catch(() => {});
	}
}

/**
 * Intenta descartar un modal inesperado presionando Escape.
 * Si el modal no está presente, no falla.
 * Útil como guard en pasos previos de fixtures.
 */
export async function dismissUnexpectedModal(page: Page): Promise<void> {
	try {
		await page.keyboard.press('Escape');
		// Pequeña espera para que el modal tenga tiempo de cerrarse
		await page.waitForTimeout(300);
	} catch {
		// Silenciar — si no hay modal, Escape es inofensivo
	}
}
