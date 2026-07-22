/**
 * Etiquetas bilingües EN|ES para selectores por texto de los POMs compartidos (carrier/contractor).
 * ================================================================================================
 *
 * La app MAGIIS tiene toggle de idioma (ES/EN) **por cuenta**. Los specs NO fijan el idioma:
 * las cuentas de USA (ej. "Remises EEUU") renderizan en inglés y las de LATAM en español.
 * Para que la suite corra sea cual sea el locale activo, los selectores por texto usan un
 * RegExp case-insensitive que acepta AMBOS idiomas.
 *
 * Mismo patrón que `tests/features/service-type-quota/pages/i18n.ts` (feature cupo), elevado a
 * `tests/pages/shared/` para reuso desde los POMs de gateway-pg.
 *
 * `TODO(i18n)` marca variantes cuyo texto EN o ES todavía no se verificó en vivo — al confirmarlo
 * contra el portal, quitar el TODO.
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Une variantes en un RegExp case-insensitive (partial match, sin anclas).
 * Para nombres que requieren match exacto, usar `rxExact`.
 */
export const rx = (...variants: string[]): RegExp => new RegExp(variants.join('|'), 'i');

/** Como `rx` pero anclado (`^…$`) — para botones cuyo nombre debe matchear exacto (ej. "Guardar"/"Save"). */
export const rxExact = (...variants: string[]): RegExp => new RegExp(`^(${variants.join('|')})$`, 'i');

/** Etiquetas de los POMs compartidos del portal carrier/contractor. */
export const CARRIER_L = {
	// Preferencias operativas — EN "Preferences Config" verificado en vivo (cuenta US, 2026-07-20); ES verificado histórico.
	preferencesHeading: rx('Configuración Parámetros', 'Preferences Config'),
	holdCardText: rx('Cobros con Tarjeta', 'Credit Card Charges'), // TODO(i18n): confirmar EN exacto en vivo
	save: rxExact('Guardar', 'Save')
} as const;

/**
 * Fuerza el idioma del portal a ESPAÑOL (BL-i18n, 2026-07-20).
 *
 * Puente temporal mientras la suite gateway no es 100% bilingüe: las cuentas de USA
 * (ej. "Remises EEUU") arrancan en inglés y rompen los selectores por texto en español.
 * El banner tiene un botón de idioma ("EN"/"ES") que abre un dropdown con ambas opciones.
 * Este helper: si el idioma actual no es ES, abre el dropdown y selecciona "ES".
 *
 * Idempotente y tolerante: si no encuentra el toggle (portal distinto / ya en ES) no falla.
 * Llamado desde `loginAsDispatcher`/`loginAsContractor` tras cargar el dashboard.
 */
export async function ensureSpanishLanguage(page: Page): Promise<void> {
	// Selector canónico del componente de idioma (confirmado en vivo 2026-07-20):
	//   app-language-dropdown > div > a > span   → el span muestra el idioma actual (EN/ES).
	const dropdown = page.locator('app-language-dropdown');
	const label = dropdown.locator('div a span').first();
	if (!(await label.isVisible().catch(() => false))) return; // portal sin selector de idioma
	const current = (await label.innerText().catch(() => '')).trim().toUpperCase();
	if (current.startsWith('ES')) return; // ya en español

	// Click en el toggle. Puede togglear directo o abrir un dropdown con opciones ES/EN.
	await dropdown
		.locator('a')
		.first()
		.click()
		.catch(() => undefined);
	const switchedDirect = await expect(label)
		.toHaveText(/ES/i, { timeout: 1_500 })
		.then(() => true)
		.catch(() => false);
	if (!switchedDirect) {
		// No fue toggle directo → elegir la opción "ES" del menú desplegado (sin re-clickear el label).
		await dropdown
			.getByText('ES', { exact: true })
			.first()
			.click({ timeout: 3_000 })
			.catch(() => undefined);
		await expect(label).toHaveText(/ES/i, { timeout: 10_000 });
	}
}
