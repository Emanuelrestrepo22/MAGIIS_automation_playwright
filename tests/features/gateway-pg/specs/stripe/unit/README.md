# `unit/` — Network mocking specs Stripe (BL-043)

Specs que **mockean** la API del gateway con `page.route()` para validar el comportamiento MAGIIS frente a respuestas controladas, **sin depender del sandbox externo**.

## Cuándo usar unit vs E2E

| Capa | Cuándo | Velocidad | Reproducibilidad |
| --- | --- | --- | --- |
| **E2E** (`web/carrier/**`) | Validar flow completo MAGIIS ↔ Stripe sandbox real. Cobertura "el sistema funciona contra el gateway real." | ~30s/spec | Depende del sandbox (latencia, disponibilidad) |
| **Unit** (`unit/**`) | Validar comportamiento MAGIIS frente a respuestas conocidas (card_declined, network timeout, JSON malformado). Cobertura "MAGIIS reacciona bien a cada response code." | <2s/spec | 100% (response controlado por el mock) |

**No reemplazan E2E — los complementan.** El mock garantiza que probamos lo que MAGIIS hace; el E2E garantiza que probamos contra lo que el gateway hace.

## Cobertura recomendada por gateway

| Response / Escenario | Stripe | Authorize | Notas |
| --- | --- | --- | --- |
| `card_declined` (generic_decline) | ✅ piloto | TODO | Cobertura del bug histórico `project_bug_viaje_calle_unhappy` |
| `card_declined` (insufficient_funds) | TODO | TODO | Edge case: hold OK + capture falla |
| 3DS challenge `requires_action` | TODO | N/A | Authorize no usa 3DS |
| Network timeout (route abort) | TODO | TODO | Edge case: gateway no responde |
| JSON malformado del SDK | TODO | TODO | Defensive coding MAGIIS |
| Rate limit (429) | TODO | TODO | Comportamiento bajo throttling |

## Patrón canónico

```typescript
import { test, expect } from '../../../../../TestBase';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe('[BL-043][unit] <gateway> network mocking — <escenario>', () => {
  test('@unit @<gateway> @<intent> <descripción>', async ({ page }) => {
    // 1. Setup mocking ANTES de navigation
    await page.route('**/api.<gateway>.com/**', async (route) => {
      await route.fulfill({
        status: <code>,
        contentType: 'application/json',
        body: JSON.stringify({ /* response controlado */ }),
      });
    });

    // 2. Flow MAGIIS estándar (login, ensureLoaded, fillMinimum, submit)
    // ...

    // 3. Assert sobre comportamiento UI/estado MAGIIS (NO sobre el response)
    await expect(page.locator('...')).toBeVisible();
  });
});
```

## Tags obligatorios

- `@unit` — distingue de specs E2E para grep selectivo.
- `@<gateway>` (`@stripe`, `@authorize`, etc.) — qué gateway se está mockeando.
- `@<intent>` (`@decline`, `@hold`, `@3ds`, etc.) — qué escenario.

## Ejecución

```bash
# Solo unit specs gateway (rápido, sin browser real navegando sandbox)
pnpm test:test:gateway-pg --project=unit

# Filtro por gateway
pnpm test:test:gateway-pg --project=unit --grep "@stripe"

# Filtro por escenario
pnpm test:test:gateway-pg --project=unit --grep "card_declined"
```

## Referencias

- [`docs/ops/BACKLOG.md`](../../../../../../docs/ops/BACKLOG.md) — BL-043
- [Playwright `page.route()`](https://playwright.dev/docs/mock)
- [Playwright network mocking](https://playwright.dev/docs/network)
- `memory/project_bug_viaje_calle_unhappy.md` — bug histórico de unhappy paths
- BL-027 (eBizCharge) — el patrón se reutilizará para mockear gateways aún sin runtime real
