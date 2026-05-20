# `tests/utils/` — Utilidades técnicas Playwright

Helpers de bajo nivel para specs y POMs. Distinto de `tests/helpers/` (wrappers Playwright API generales) y `tests/shared/utils/` (API clients + parsers).

## Contenido

| Archivo / dir | Qué hace |
| --- | --- |
| `expect-extend.ts` | **BL-040** — `expect.configure` por dominio (3DS, gateway-settle, fast, auth) + helpers soft assertions |
| `reporters/` | Reporters Playwright custom (`custom-reporter.ts`) |
| `scripts/` | CLI scripts (`update-matriz-xlsx.ts`) |

## `expect-extend.ts` — guía rápida

### Cuándo usar cada configure

| Configure | Timeout | Cuándo |
| --- | --- | --- |
| `expect3DS` | 30s | Modales/iframes 3DS (Stripe challenge frame, ACS bancarios) |
| `expectGatewaySettle` | 20s | Confirmaciones post-API (hold settle, dashboard update tras submit) |
| `expectFast` | 2s | DOM-síncrono (assertions inmediatas sobre elementos ya en DOM) |
| `expectAuth` | 15s | Login flows (LoginPage shell, dashboard ready post-auth) |

### Ejemplos

```typescript
import { expect3DS, expectGatewaySettle, expectFast, expectAuth } from 'tests/utils/expect-extend';

// 3DS modal
await expect3DS(threeDsModal.completeButton).toBeVisible();

// Confirmación post-submit (settle del backend)
await expectGatewaySettle(travelManagement.porAsignarRow).toBeVisible();

// Click feedback inmediato
await expectFast(submitButton).toBeEnabled();

// Login flow
await expectAuth(dashboardPage.userMenu).toBeVisible();
```

### Soft assertions (no abortan al primer fallo)

Para E2E híbridos donde un fallo temprano corta la captura de evidencia de fases posteriores:

```typescript
import { expect } from '@playwright/test';
import { assertSoftThenFail } from 'tests/utils/expect-extend';

test('flow1 web + mobile híbrido', async ({ page }, testInfo) => {
	// Fase WEB — acumular soft assertions
	await expect.soft(travelDetail.status).toContainText('SEARCHING_DRIVER', { timeout: 20_000 });
	await expect.soft(travelDetail.passenger).toContainText('Emanuel Restrepo');
	await expect.soft(journeyContext.tripId).toBeTruthy();

	// Fase MOBILE — sigue corriendo aunque haya soft failures arriba
	await runMobilePhase(...);

	// Al final — dispara fail consolidado con TODOS los soft errors
	assertSoftThenFail(testInfo);
});
```

**Nota:** `expect.soft.configure()` NO existe en la API Playwright. Para soft + timeout custom, usar timeout inline: `expect.soft(x).toBeVisible({ timeout: 30_000 })`.

## Convención de naming

- POMs (PascalCase + sufijo `Page`): `tests/pages/`
- Helpers Playwright generales (kebab-case): `tests/helpers/`
- API clients / parsers (kebab-case): `tests/shared/utils/`
- Utilidades técnicas + reporters + scripts (kebab-case): `tests/utils/` (este dir)

## Referencias

- [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §"Dónde agregar helper nuevo"
- [Playwright `expect.configure`](https://playwright.dev/docs/test-assertions#expectconfigure)
- [Playwright soft assertions](https://playwright.dev/docs/test-assertions#soft-assertions)
- BL-040 en [`docs/ops/BACKLOG.md`](../../docs/ops/BACKLOG.md)
