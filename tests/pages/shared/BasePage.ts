// tests/pages/shared/BasePage.ts
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * BasePage — sustrato común de todos los Page Objects del portal V1 (Angular legacy).
 *
 * Centraliza las primitivas de interacción con los widgets globales de MAGIIS V1
 * (overlay de carga, dropdowns `select-dropdown`, botones que habilitan async,
 * autocompletes con debounce Angular BL-012) para que cada feature (gateway, flights,
 * otherCosts…) las reuse sin reimplementar timing/locators.
 *
 * Extraído de `NewTravelPageBase` (2026-07, refactor de encapsulación) SIN cambio de
 * comportamiento: mismos locators, mismos timeouts, misma semántica de espera.
 */
export abstract class BasePage {
	protected readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	protected async waitForEnabledButton(button: Locator, timeout = 45_000): Promise<void> {
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			const visible = await button.isVisible().catch(() => false);
			const enabled = await button.isEnabled().catch(() => false);

			if (visible && enabled) {
				return;
			}

			// NOTE(tier3-kept): polling loop con condición compuesta visible+enabled — retryAsync no modela este patrón de forma más clara
			await this.page.waitForTimeout(500);
		}

		throw new Error('Button did not become enabled before timeout');
	}

	protected async waitForLoadingOverlayToDisappear(timeout = 15_000): Promise<void> {
		await this.page
			.locator('.black-overlay')
			.waitFor({ state: 'hidden', timeout })
			.catch(() => undefined);
	}

	protected async openDropdown(select: Locator, timeout = 10_000): Promise<void> {
		const trigger = select.locator('.below > .single > .value, .below > .single > .placeholder, .below').first();
		await expect(trigger).toBeVisible({ timeout });
		await trigger.click({ force: true });

		const dropdown = select.locator('select-dropdown').first();
		await dropdown.waitFor({ state: 'attached', timeout });
	}

	protected async chooseDropdownOption(select: Locator, optionText: string, timeout = 10_000): Promise<void> {
		await this.openDropdown(select, timeout);
		const option = select.locator('select-dropdown .options li').filter({ hasText: optionText }).first();
		await expect(option).toBeVisible({ timeout });
		await option.click();
	}

	protected async clickButtonByName(name: string | RegExp, timeout = 10_000): Promise<void> {
		const button = this.page.getByRole('button', { name });
		await expect(button).toBeVisible({ timeout });
		await button.click();
	}

	/**
	 * BL-012 Fase 1 — espera a que Angular renderice al menos una opción en el
	 * autocomplete/dropdown asociado al componente. Reemplaza `waitForTimeout`
	 * usado como debounce ciego con polling DOM determinista. Más rápido cuando
	 * Angular responde antes; fail-fast si el debounce no termina en `timeoutMs`.
	 *
	 * Detecta opciones en 3 ubicaciones (en orden):
	 *   1. `select-dropdown .options li` — dropdown nativo del SuperPage.
	 *   2. `getByRole('listitem')` inline dentro del componente.
	 *   3. `getByRole('listitem')` a nivel de página (CDK overlay).
	 *
	 * Patrón validado en contractor commit `0299955` (Fase 1 contractor).
	 */
	protected async waitForAutocompleteOptionsReady(
		component: Locator,
		options: { timeoutMs?: number } = {}
	): Promise<void> {
		const timeoutMs = options.timeoutMs ?? 4_000;
		await expect
			.poll(
				async () => {
					const dropdownOptions = await component.locator('select-dropdown .options li').count();
					if (dropdownOptions > 0) return dropdownOptions;
					const inlineList = await component.getByRole('listitem').count();
					if (inlineList > 0) return inlineList;
					return await this.page.getByRole('listitem').count();
				},
				{
					timeout: timeoutMs,
					message:
						'BL-012: esperando opciones de autocomplete Angular (dropdown nativo, inline o CDK overlay)'
				}
			)
			.toBeGreaterThan(0);
	}
}
