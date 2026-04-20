/**
 * tests/helpers/retry.ts
 * Retry transversal sobre operaciones idempotentes con backoff incremental.
 * No migrar usos de waitForTimeout directamente — ver TIER 2.x.
 */

export interface RetryOptions {
	/** Número máximo de intentos (default: 3) */
	attempts?: number;
	/** Delay base en ms — se multiplica por el número de intento (default: 500) */
	delayMs?: number;
	/** Callback opcional llamado antes de cada reintento */
	onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Reintenta una función async con backoff incremental.
 * En cada fallo espera `delayMs * intentoActual` antes del siguiente intento.
 */
export async function retryAsync<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
	const { attempts = 3, delayMs = 500, onRetry } = options;
	let lastError: Error = new Error('retryAsync: sin intentos realizados');

	for (let i = 1; i <= attempts; i++) {
		try {
			return await fn();
		} catch (err) {
			lastError = err as Error;
			if (i === attempts) break;
			onRetry?.(i, lastError);
			await new Promise<void>(r => setTimeout(r, delayMs * i));
		}
	}

	throw lastError;
}
