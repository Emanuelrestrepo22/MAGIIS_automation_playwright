# Propuesta refactor — `PassengerWalletScreen.ts`

**Fecha:** 2026-04-16
**Contexto:** Sesión manual reprodujo escenarios happy/fail de add-card con 3DS. Capturamos los selectores canónicos del **modal de error de autenticación** que hoy no existen como método dedicado en el Screen.

## Problema
Hoy `PassengerWalletScreen.saveCard()` asume éxito o silencio. No hay handler explícito para el modal de error 3DS FAIL:

- Título: `Información Inválida`
- Mensaje: `No podemos autenticar tu método de pago. Elige otro método de pago y vuelve a intentarlo.`
- CTA: `Reintentar`
- Host: `app-confirm-modal` en `ion-modal` dinámico.

Si el backend rechaza el 3DS, el test queda colgado hasta el timeout sin explicar por qué.

## Cambios propuestos

### 1. Constantes centralizadas (top del archivo)

```typescript
const AUTH_ERROR_MODAL = {
	hostSelector: 'app-confirm-modal',
	titleText: 'Información Inválida',
	bodyText: 'No podemos autenticar tu método de pago. Elige otro método de pago y vuelve a intentarlo.',
	ctaText: 'Reintentar',
} as const;
```

### 2. Método público nuevo

```typescript
/**
 * Detects the 3DS "Información Inválida" auth-error modal.
 * Returns the visible state so callers can decide: retry, abort, record as bug.
 */
async detectAuthErrorModal(timeout = 5_000): Promise<{
	present: boolean;
	title?: string;
	message?: string;
	hasRetryButton: boolean;
}> {
	const driver = this.getDriver();
	const deadline = Date.now() + timeout;

	while (Date.now() < deadline) {
		const state = await driver.executeAsync<{
			present: boolean;
			title?: string;
			message?: string;
			hasRetryButton: boolean;
		}, []>(function (done) {
			const modal = document.querySelector('app-confirm-modal');
			if (!modal || !(modal as HTMLElement).offsetParent) {
				done({ present: false, hasRetryButton: false });
				return;
			}
			const text = (modal.textContent || '').trim();
			const buttons = Array.from(modal.querySelectorAll('button, ion-button')) as HTMLElement[];
			const retry = buttons.find(b => (b.textContent || '').trim().toLowerCase().includes('reintent'));
			done({
				present: true,
				title: text.includes('Información Inválida') ? 'Información Inválida' : undefined,
				message: text.includes('No podemos autenticar') ? text.trim() : undefined,
				hasRetryButton: Boolean(retry),
			});
		}).catch(() => ({ present: false, hasRetryButton: false }));

		if (state?.present) {
			return state;
		}
		await driver.pause(250);
	}
	return { present: false, hasRetryButton: false };
}

/**
 * Taps "Reintentar" in the auth-error modal. Requires a detectAuthErrorModal()
 * hit first. Preserves form data (fields remain complete on return).
 */
async tapAuthErrorRetry(): Promise<boolean> {
	const driver = this.getDriver();
	const clicked = await driver.execute(function () {
		const modal = document.querySelector('app-confirm-modal');
		if (!modal) return false;
		const buttons = Array.from(modal.querySelectorAll('button, ion-button')) as HTMLElement[];
		const retry = buttons.find(b => (b.textContent || '').trim().toLowerCase().includes('reintent'));
		if (!retry) return false;
		retry.click();
		return true;
	}).catch(() => false);

	if (clicked) {
		await driver.pause(400);
	}
	return clicked;
}

/**
 * Convenience: after saveCard(), check for auth error and optionally recover
 * by tapping Retry. Returns the decision path taken.
 */
async handleAuth3dsFailIfPresent(options: { retry: boolean } = { retry: false }): Promise<
	| { outcome: 'no-error' }
	| { outcome: 'error-detected'; recovered: boolean; message?: string }
> {
	const detection = await this.detectAuthErrorModal();
	if (!detection.present) {
		return { outcome: 'no-error' };
	}
	if (!options.retry) {
		return { outcome: 'error-detected', recovered: false, message: detection.message };
	}
	const recovered = await this.tapAuthErrorRetry();
	return { outcome: 'error-detected', recovered, message: detection.message };
}
```

### 3. Integración sugerida en el harness

En `tests/mobile/appium/harness/PassengerTripHappyPathHarness.ts`, después del `saveCard()`:

```typescript
await wallet.saveCard();
const authCheck = await wallet.handleAuth3dsFailIfPresent({ retry: false });
if (authCheck.outcome === 'error-detected') {
	throw new Error(`3DS auth rejected: ${authCheck.message ?? 'unknown reason'}`);
}
// continuar con verificación de tarjeta en lista
```

## Riesgos / consideraciones

- El `id` del `ion-modal` es dinámico (`ion-overlay-38` en esta corrida) — usar solo `app-confirm-modal` como ancla estable.
- El texto `Información Inválida` puede estar i18n-izado en el futuro. Dejar el chequeo flexible (`includes`) o mover a constante por locale.
- El popup 3DS de Visa (FAIL/COMPLETE) **no es accesible** por WebView de Appium; requiere mocks o switch a NATIVE_APP. No es parte de este refactor.

## Alcance del cambio
- ✅ Aditivo: nuevos métodos, no rompe `saveCard()` existente.
- ✅ No toca selectores actuales.
- ✅ Trazable a `TC-PAX-WALLET-ADD-3DS-FAIL-RETRY.md`.

## Próximos pasos
1. Revisar y aprobar los nombres de método + API.
2. Implementar en una rama `feature/ai-pax-wallet-auth-error-handler`.
3. Sumar test spec que use la nueva API con mock Stripe que devuelva fallo 3DS.
