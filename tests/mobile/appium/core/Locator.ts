/**
 * Locator — estrategia de ubicación con orden de preferencia (D3):
 *   nativo: accessibility id -> resource-id -> clase  |  WebView: CSS (clase / app-* / aria-label)
 *   -> texto por clave i18n (último recurso) -> xpath explícito (excepción justificada).
 * No hay helper que arme xpath con texto: el texto siempre entra por `textKey` + I18n.
 */

export type NativeLocator =
	| { accessibilityId: string }
	| { resourceId: string }
	| { className: string }
	| { xpath: string };

export type Locator = {
	/** Nombre estable para logs/errores (p. ej. `driver.confirm.acceptButton`). */
	id: string;
	/** Selector(es) CSS de la WebView, por orden de preferencia. */
	web?: string | readonly string[];
	native?: NativeLocator;
	/** Clave de `data/i18n/*.json`; se resuelve con `I18n` (último recurso). */
	textKey?: string;
};

export type LocatorStrategyKind = 'accessibilityId' | 'resourceId' | 'className' | 'web' | 'text' | 'xpath';

export type LocatorStrategy = { kind: LocatorStrategyKind; value: string };

export function resolveWebSelectors(locator: Locator): string[] {
	if (!locator.web) return [];
	const list: readonly string[] = typeof locator.web === 'string' ? [locator.web] : locator.web;
	return list.filter(s => s.trim().length > 0);
}

/** Crea y valida un locator (id no vacío y al menos una estrategia). */
export function defineLocator(locator: Locator): Locator {
	if (!locator.id.trim()) throw new Error('Locator sin id.');
	if (resolveWebSelectors(locator).length === 0 && !locator.native && !locator.textKey) {
		throw new Error(`Locator "${locator.id}" no define ninguna estrategia (web, native o textKey).`);
	}
	return locator;
}

/** Selector WebdriverIO (`~id`, `id:pkg:id/x`, `android.widget.X`, `//xpath`) del bloque nativo. */
export function toNativeSelector(native: NativeLocator): string {
	if ('accessibilityId' in native) return `~${native.accessibilityId}`;
	if ('resourceId' in native) return `id:${native.resourceId}`;
	if ('className' in native) return native.className;
	return native.xpath;
}

/** Estrategias en orden de preferencia (nativo estable -> web -> texto -> xpath). */
export function orderedStrategies(locator: Locator): LocatorStrategy[] {
	const out: LocatorStrategy[] = [];
	const n = locator.native;
	if (n && 'accessibilityId' in n) out.push({ kind: 'accessibilityId', value: toNativeSelector(n) });
	if (n && 'resourceId' in n) out.push({ kind: 'resourceId', value: toNativeSelector(n) });
	if (n && 'className' in n) out.push({ kind: 'className', value: toNativeSelector(n) });
	for (const css of resolveWebSelectors(locator)) out.push({ kind: 'web', value: css });
	if (locator.textKey) out.push({ kind: 'text', value: locator.textKey });
	if (n && 'xpath' in n) out.push({ kind: 'xpath', value: toNativeSelector(n) });
	return out;
}
