# Convención de tags Playwright — qa-gateway-magiis (BL-045)

> Tags `@` en `test.describe()` para filtrado con `--grep`. Reemplazan la proliferación de scripts `test:*` con criterio declarativo de cobertura.

## Categorías

### Capa de cobertura

| Tag | Significado |
|---|---|
| `@smoke` | Suite mínima crítica que valida que el sistema responde. Corre rápido. |
| `@critical` | Flujos críticos de negocio (gateway, auth). Falla = bloqueante de release. |
| `@regression` | Cobertura amplia. Corre en pipelines de release. |

### Dominio

| Tag | Significado |
|---|---|
| `@gateway` | Tests del gateway de pagos (web). |
| `@auth` | Login/logout/session. |
| `@navbar` | Navegación cross-portal. |
| `@e2e-hybrid` | E2E con fase móvil Appium. |

### Gateway específico

| Tag | Significado |
|---|---|
| `@stripe` | Suite Stripe. |
| `@authorize` | Suite Authorize.net. |
| `@mercadopago` | Slot reservado (BL-026). |
| `@ebizcharge` | Slot reservado (BL-027). |

### Intent (tipo de flujo)

| Tag | Significado |
|---|---|
| `@hold` | Hold/preautorización. |
| `@3ds` | Flujos con autenticación 3DS. Requiere `--workers=1` por convención. |
| `@capture` | Cobro post-completion. |
| `@decline` | Tarjeta declinada / fail post-auth. |
| `@wallet` | Vincular/desvincular tarjeta. |
| `@cargo-a-bordo` | Tipo de viaje "Cargo a Bordo". |

### Estado

| Tag | Significado |
|---|---|
| `@flaky` | Conocido como flaky. Retry alto. |
| `@wip` | Work in progress, no incluir en CI default. |
| `@visual` | Visual regression (BL-044). Opt-in, no incluir en default. |

## Ejemplos de uso

```bash
# Smoke + critical
npx playwright test --grep="@smoke|@critical"

# Stripe + 3DS (con workers=1 obligatorio)
npx playwright test --grep="@stripe.*@3ds" --workers=1

# Gateway pero sin visual
npx playwright test --grep="@gateway" --grep-invert="@visual"
```

## Tabla: script deprecado → grep equivalente

| Script deprecado | Reemplazo |
|---|---|
| `test:gateway:smoke` | `pnpm test:test:smoke` o `--grep=@smoke` |
| `test:gateway:critical` | `pnpm test:test:critical` o `--grep=@critical` |
| `test:gateway:regression` | `pnpm test:test:gateway` (todo @gateway) |
| `test:gateway:cargo` | `--grep=@cargo-a-bordo` |
| `test:gateway:all` | `pnpm test:test:gateway` |
| `test:test:gateway-pg` | `pnpm test:test:gateway` |
| `test:test:gateway-pg:stripe` | `pnpm test:test:gateway:stripe` o `--grep=@stripe` |
| `test:test:gateway-pg:authorize` | `pnpm test:test:gateway:authorize` o `--grep=@authorize` |
| `test:test:gateway-pg:parametrized` | `--grep=@gateway` (parametrizados llevan tags estándar) |
| `test:test:gateway-pg:stripe:3ds` | `pnpm test:test:gateway:3ds` |
| `test:test:gateway-pg:stripe:recovery` | `--grep="@stripe.*@3ds"` |
| `test:test:gateway-pg:3ds` | `pnpm test:test:gateway:3ds` |
| `test:test:smoke:gateway` | `pnpm test:test:smoke` (con suite gateway taggeada @smoke) |
| `test:test:smoke:gateway:carrier` | `--grep="@smoke.*@gateway"` + filtro `Portal Carrier` |
| `test:test:smoke:gateway:contractor` | `--grep="@smoke.*@gateway"` + filtro `Portal Contractor` |

## Política

1. Cada `test.describe()` debe tener al menos: 1 capa + 1 dominio + (si aplica) 1 gateway + tags de intent que correspondan.
2. NO inventar tags. Si un caso no encaja, abrir discusión antes de agregar.
3. `@3ds` implica `--workers=1` en CI.
4. `@visual` NO se incluye en regression default (ya excluido en `playwright.gateway-pg.config.ts` regression-web).
