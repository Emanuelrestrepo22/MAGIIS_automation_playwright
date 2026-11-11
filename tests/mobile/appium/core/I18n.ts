/**
 * I18n — `t(key, locale)` sobre `data/i18n/{es,en,fr}.json`.
 * Cada key -> lista de textos: el primero es el canónico; el resto, variantes (legado).
 * Una key faltante FALLA (no devuelve la key ni un texto inventado). Valores `TODO-verificar` también
 * fallan al pedirlos y se listan con `pendingKeys(locale)`.
 * Fuente es/en: `magiis-mobile-driver-v2` `src/assets/i18n` (ya citada en DriverFlowSelectors).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type Locale = 'es' | 'en' | 'fr';
export const LOCALES: readonly Locale[] = ['es', 'en', 'fr'];
export const PENDING_MARK = 'TODO-verificar';

export type I18nDictionary = Record<string, readonly string[]>;
export type I18nDictionaries = Partial<Record<Locale, I18nDictionary>>;

export class I18nKeyMissingError extends Error {
	constructor(
		readonly locale: Locale,
		readonly key: string
	) {
		super(`i18n: falta la key "${key}" en "${locale}".`);
		this.name = 'I18nKeyMissingError';
	}
}

export class I18nPendingTextError extends Error {
	constructor(
		readonly locale: Locale,
		readonly key: string
	) {
		super(`i18n: "${key}" en "${locale}" está marcada ${PENDING_MARK} (sin fuente verificada); no se inventa el texto.`);
		this.name = 'I18nPendingTextError';
	}
}

/**
 * Locale por perfil de chofer. Suposición declarada: solo `fr-1901` está confirmado como FR;
 * `test-default` y `test-mp` (MercadoPago, AR) se asumen `es`.
 */
export const PROFILE_LOCALES: Readonly<Record<string, Locale>> = {
	'fr-1901': 'fr',
	'test-default': 'es',
	'test-mp': 'es'
};

export function localeForProfile(profileId: string, map: Readonly<Record<string, Locale>> = PROFILE_LOCALES): Locale {
	const locale = map[profileId];
	if (!locale) throw new Error(`i18n: el perfil "${profileId}" no tiene locale definido.`);
	return locale;
}

export function isLocale(v: string): v is Locale {
	return (LOCALES as readonly string[]).includes(v);
}

function normalize(v: string): string {
	return v.replace(/\s+/g, ' ').trim().toLowerCase();
}

function loadDefault(): I18nDictionaries {
	const dir = fileURLToPath(new URL('../data/i18n/', import.meta.url));
	const out: I18nDictionaries = {};
	for (const l of LOCALES) out[l] = JSON.parse(readFileSync(`${dir}${l}.json`, 'utf8')) as I18nDictionary;
	return out;
}

export class I18n {
	private readonly dictionaries: I18nDictionaries;

	constructor(
		readonly locale: Locale,
		dictionaries?: I18nDictionaries
	) {
		this.dictionaries = dictionaries ?? loadDefault();
	}

	static forProfile(profileId: string, dictionaries?: I18nDictionaries): I18n {
		return new I18n(localeForProfile(profileId), dictionaries);
	}

	/**
	 * Locale del perfil salvo override `APP_LOCALE` (es|en|fr) en el `env` recibido: el idioma lo fija el
	 * dispositivo (11/11: emulator-5556 en inglés con perfil test-default). Valor inválido = error explícito.
	 */
	static forProfileWithEnv(profileId: string, env: Readonly<Record<string, string | undefined>>): I18n {
		const override = env.APP_LOCALE?.trim();
		if (!override) return I18n.forProfile(profileId);
		if (!isLocale(override)) throw new Error(`i18n: APP_LOCALE="${override}" inválido (es|en|fr).`);
		return new I18n(override);
	}

	/** Todas las variantes de la key (canónica primero). */
	variants(key: string, locale: Locale = this.locale): string[] {
		const values = this.dictionaries[locale]?.[key];
		if (!values || values.length === 0) throw new I18nKeyMissingError(locale, key);
		if (values.some(v => v.startsWith(PENDING_MARK))) throw new I18nPendingTextError(locale, key);
		return [...values];
	}

	/** Texto canónico de la key. */
	t(key: string, locale: Locale = this.locale): string {
		return this.variants(key, locale)[0]!;
	}

	/** Comparación exacta insensible a mayúsculas/espacios contra cualquier variante de la key. */
	matches(text: string | null | undefined, key: string, locale: Locale = this.locale): boolean {
		const t = normalize(text ?? '');
		return t.length > 0 && this.variants(key, locale).some(v => normalize(v) === t);
	}

	/** Keys de `locale` con texto pendiente de verificar (para reportar). */
	pendingKeys(locale: Locale = this.locale): string[] {
		const dict = this.dictionaries[locale] ?? {};
		return Object.keys(dict).filter(k => dict[k]!.some(v => v.startsWith(PENDING_MARK)));
	}

	/** Keys que existen en algún locale y faltan en `locale`. */
	missingKeys(locale: Locale = this.locale): string[] {
		const all = new Set<string>();
		for (const l of LOCALES) for (const k of Object.keys(this.dictionaries[l] ?? {})) all.add(k);
		const have = this.dictionaries[locale] ?? {};
		return [...all].filter(k => !(k in have)).sort();
	}
}
