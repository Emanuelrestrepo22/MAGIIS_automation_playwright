/**
 * Waits — único lugar de la capa mobile con espera por tiempo (`sleep`).
 * Todo lo demás espera por CONDICIÓN observable con `until` / `tryUntil` (D7).
 * No depende de screens/pbo/flows.
 */

import type { Locator } from './Locator';
import { resolveWebSelectors } from './Locator';

export type UntilOptions = {
	/** Tope total en ms (default 10 000). */
	timeout?: number;
	/** Pausa entre intentos en ms (default 250). */
	interval?: number;
	/** Descripción humana de lo que se espera; sale en el error de timeout. */
	label?: string;
};

export class WaitTimeoutError extends Error {
	constructor(
		readonly label: string,
		readonly timeoutMs: number
	) {
		super(`Timeout de ${timeoutMs} ms esperando: ${label}`);
		this.name = 'WaitTimeoutError';
	}
}

const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_INTERVAL = 250;

type Condition<T> = () => Promise<T | false | null | undefined> | T | false | null | undefined;

/** Espera por tiempo fijo. Solo para backoff entre intentos; no usar como sincronización. */
export function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Reintenta `condition` hasta que devuelva un valor truthy.
 * Devuelve `null` si vence el timeout. Una excepción dentro de `condition` cuenta como "aún no".
 */
export async function tryUntil<T>(condition: Condition<T>, options: UntilOptions = {}): Promise<T | null> {
	const timeout = options.timeout ?? DEFAULT_TIMEOUT;
	const interval = options.interval ?? DEFAULT_INTERVAL;
	const deadline = Date.now() + timeout;
	for (;;) {
		try {
			const value = await condition();
			if (value) return value as T;
		} catch {
			// se reintenta hasta el deadline
		}
		const remaining = deadline - Date.now();
		if (remaining <= 0) return null;
		await sleep(Math.min(interval, remaining));
	}
}

/** Como `tryUntil`, pero lanza `WaitTimeoutError` al vencer. */
export async function until<T>(condition: Condition<T>, options: UntilOptions = {}): Promise<T> {
	const value = await tryUntil(condition, options);
	if (value === null) {
		throw new WaitTimeoutError(options.label ?? 'condición sin descripción', options.timeout ?? DEFAULT_TIMEOUT);
	}
	return value;
}

/** Subconjunto del driver que necesita `waitForWebVisible` (permite fakes en unit). */
export type WebExecutor = {
	execute(script: (selector: string) => boolean, selector: string): Promise<boolean>;
};

/**
 * Espera a que algún selector web del locator sea visible en la WebView activa.
 * Devuelve el selector que matcheó (útil para evidencia: `matchedBy`).
 */
export async function waitForWebVisible(driver: WebExecutor, locator: Locator, options: UntilOptions = {}): Promise<string> {
	const selectors = resolveWebSelectors(locator);
	if (selectors.length === 0) throw new Error(`Locator "${locator.id}" no tiene selector web.`);
	return until(
		async () => {
			for (const selector of selectors) {
				const visible = await driver.execute((sel: string) => {
					const el = document.querySelector(sel) as HTMLElement | null;
					if (!el) return false;
					const rect = el.getBoundingClientRect();
					const style = window.getComputedStyle(el);
					return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
				}, selector);
				if (visible) return selector;
			}
			return false;
		},
		{ label: `locator web "${locator.id}" visible`, ...options }
	);
}

/** Espacio de nombres para importar como `Waits.until(...)`. */
export const Waits = { sleep, until, tryUntil, waitForWebVisible, WaitTimeoutError } as const;
