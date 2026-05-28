/**
 * Expect Extend — `expect.configure` por dominio + helpers para soft assertions.
 * ===============================================================================
 *
 * BL-040 (2026-05-19) — elimina magic numbers de timeout en specs y habilita
 * un patrón canónico de soft assertions en flows E2E híbridos que NO debe
 * abortar al primer fallo (para preservar evidencia de los pasos siguientes).
 *
 * ## Por qué este archivo
 *
 * Antes:
 *
 * ```typescript
 * await expect(modal3DS.completeButton).toBeVisible({ timeout: 30_000 });  // magic
 * await expect(travelRow).toBeVisible({ timeout: 20_000 });                 // magic
 * await expect(button).toBeEnabled({ timeout: 2_000 });                     // magic
 * ```
 *
 * Después:
 *
 * ```typescript
 * import { expect3DS, expectGatewaySettle, expectFast } from 'tests/utils/expect-extend';
 *
 * await expect3DS(modal3DS.completeButton).toBeVisible();          // semántico
 * await expectGatewaySettle(travelRow).toBeVisible();              // semántico
 * await expectFast(button).toBeEnabled();                          // semántico
 * ```
 *
 * Beneficios:
 *   - Intent del timeout legible (3DS / gateway-settle / dom-sincronico).
 *   - Si Stripe cambia el tiempo de su iframe 3DS, **un solo lugar** se actualiza.
 *   - Trazable: grep por nombre del configure muestra cuántos specs lo usan.
 *
 * ## Soft assertions (E2E híbridos)
 *
 * En flows como `flow1.e2e.spec.ts` (web + mobile Appium), un fallo en el
 * assertion 5 corta el spec antes de la fase mobile. Sin contexto del estado
 * web final, debuggear el handoff es ciego. El patrón soft acumula fallos
 * sin abortar:
 *
 * ```typescript
 * import { assertSoftThenFail } from 'tests/utils/expect-extend';
 *
 * await expect.soft(travelDetail.status).toContainText('SEARCHING_DRIVER');
 * await expect.soft(travelDetail.passenger).toContainText(JOURNEY_DEFAULTS.passenger);
 * await expect.soft(journeyContext.tripId).toBeTruthy();
 *
 * // ... fase mobile (puede correr aunque alguno haya fallado arriba) ...
 *
 * await assertSoftThenFail(test.info());  // dispara el fail consolidado al final
 * ```
 *
 * Referencia: <https://playwright.dev/docs/test-assertions#soft-assertions>
 *             <https://playwright.dev/docs/test-assertions#expectconfigure>
 */

import { expect, type TestInfo } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURES POR DOMINIO
// ═══════════════════════════════════════════════════════════════════════

/**
 * Assertions sobre modales/iframes 3DS (Stripe challenge frame, ACS bancarios).
 *
 * Timeout 30s — Stripe puede tardar hasta 10-20s en montar el iframe 3DS
 * dependiendo del network y el sandbox. Tests Stripe 3DS son la principal
 * razón por la que `actionTimeout: 15_000` está global en playwright.config.
 *
 * Usar para:
 *   - `ThreeDSModal.overlay` aparecer/ocultarse
 *   - `ThreeDSModal.completeButton` / `failButton` visible
 *   - Cualquier locator dentro de `iframe[name="stripe-challenge-frame"]`
 */
export const expect3DS = expect.configure({ timeout: 30_000 });

/**
 * Assertions sobre confirmaciones post-API del gateway (hold settle, capture,
 * webhook propagation, dashboard update tras submit).
 *
 * Timeout 20s — el backend MAGIIS necesita procesar la respuesta del gateway
 * y propagar el estado al dashboard. Stripe SetupIntent → PaymentIntent →
 * MAGIIS state machine puede tardar 5-15s en sandboxes loaded.
 *
 * Usar para:
 *   - `travelManagementPage.porAsignarRow` aparecer
 *   - `travelDetail.status` cambiar a `SEARCHING_DRIVER`/`NO_AUTORIZADO`
 *   - Cualquier assertion sobre estado que dependa de API callback
 */
export const expectGatewaySettle = expect.configure({ timeout: 20_000 });

/**
 * Assertions DOM-síncronas (elementos ya en DOM al momento del assert,
 * no requieren network round-trip).
 *
 * Timeout 2s — si el elemento no aparece rápido, probablemente nunca aparece.
 * Falla fast para evitar timeouts de 30s en bugs reales.
 *
 * Usar para:
 *   - Visibilidad de botones/labels post-fill
 *   - Texto de toast notifications
 *   - Estado de switches/toggles
 *   - Assertions inmediatamente post-click sobre elementos DOM existentes
 */
export const expectFast = expect.configure({ timeout: 2_000 });

/**
 * Assertions sobre login flows (LoginPage shell, dashboard ready post-auth).
 *
 * Timeout 15s — el shell de MAGIIS puede ser lento al cold-start del SPA
 * Angular. Tests de auth necesitan margen para el primer paint del dashboard.
 *
 * Usar para:
 *   - `dashboardPage.ensureDashboardLoaded()` (después de `loginAsX`)
 *   - Aparición del shell post-login
 */
export const expectAuth = expect.configure({ timeout: 15_000 });

// ═══════════════════════════════════════════════════════════════════════
// SOFT ASSERTIONS HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Cierra el spec disparando un fallo consolidado si hubo soft errors.
 *
 * Patrón canónico para flows E2E híbridos donde se acumulan asserts soft
 * para preservar evidencia de fases posteriores (ej: mobile Appium después
 * de la fase web).
 *
 * Usar AL FINAL del test, después de todas las assertions soft:
 *
 * ```typescript
 * test('flow1 hybrid happy path', async ({ page }, testInfo) => {
 *   // ... fase web ...
 *   await expect.soft(...).toBeVisible();
 *   await expect.soft(...).toContainText('SEARCHING_DRIVER');
 *
 *   // ... fase mobile (corre aunque haya soft failures arriba) ...
 *
 *   assertSoftThenFail(testInfo);  // ← dispara fail consolidado si hubo errors
 * });
 * ```
 *
 * @param testInfo — `test.info()` o el parámetro `testInfo` del callback.
 * @throws Si hay >= 1 soft assertion failure acumulado.
 */
export function assertSoftThenFail(testInfo: TestInfo): void {
	if (testInfo.errors.length > 0) {
		const summary = testInfo.errors
			.map((err, i) => `  [${i + 1}] ${err.message?.split('\n')[0] ?? 'soft assertion failed'}`)
			.join('\n');
		throw new Error(
			`[soft-assertions] ${testInfo.errors.length} soft failure(s) acumulado(s) en este spec:\n${summary}`
		);
	}
}

/**
 * Patrón soft + timeout por dominio (inline).
 *
 * `expect.soft` NO acepta `.configure()` por diseño de la API Playwright.
 * Para soft assertions con timeout no-default, usar el timeout inline:
 *
 * ```typescript
 * // 3DS soft (no aborta, timeout 30s)
 * await expect.soft(modal.overlay).toBeVisible({ timeout: 30_000 });
 *
 * // gateway-settle soft (no aborta, timeout 20s)
 * await expect.soft(travelRow).toBeVisible({ timeout: 20_000 });
 *
 * // dom-síncrono soft (no aborta, timeout 2s default es OK)
 * await expect.soft(button).toBeEnabled();
 *
 * // al final del spec — dispara fail consolidado si hubo errors
 * assertSoftThenFail(testInfo);
 * ```
 *
 * Si querés evitar repetir el timeout, usar los configures NO-soft arriba
 * (`expect3DS`, `expectGatewaySettle`) y aceptar que abortarán al primer
 * fallo. La combinación "soft + configure por dominio" requiere repetir
 * el timeout en cada call — es trade-off conocido de Playwright.
 */
