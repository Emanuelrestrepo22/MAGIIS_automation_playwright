/**
 * tests/helpers/assertions.ts
 * Assertions custom reutilizables sobre Playwright Locator y Page.
 * Evita duplicar getByTestId + toBeVisible en cada spec.
 * Detectado en codebase: expect.poll en NewTravelPageBase.ts:899,
 * múltiples toBeVisible dispersos — centralizar aquí para specs futuros.
 */

import { type Locator, type Page, expect } from '@playwright/test';

/**
 * Espera hasta que el locator sea visible con un timeout configurable.
 * Alternativa estable a waitForTimeout + toBeVisible.
 */
export async function expectEventuallyVisible(locator: Locator, timeout = 10_000): Promise<void> {
	await expect(locator).toBeVisible({ timeout });
}

/**
 * Espera hasta que el locator muestre el texto esperado de forma estable.
 * Útil para elementos que se hidratan o cargan datos async.
 * Usa expect.poll para tolerar estados intermedios vacíos.
 */
export async function expectStableText(locator: Locator, text: string, timeout = 10_000): Promise<void> {
	await expect
		.poll(
			async () => {
				const content = await locator.textContent().catch(() => '');
				return (content ?? '').trim();
			},
			{ timeout, message: `Esperando texto estable: "${text}"` }
		)
		.toContain(text);
}

/**
 * Espera hasta que la URL del page coincida con un patrón (string o RegExp).
 * Útil después de navegaciones que demoran en resolver el shell.
 */
export async function expectUrlMatches(page: Page, pattern: string | RegExp, timeout = 15_000): Promise<void> {
	await expect(page).toHaveURL(pattern, { timeout });
}
