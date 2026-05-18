# `api/` — Pruebas API del feature gateway-pg

Este directorio contiene tests de tipo **API** (sin browser) que validan la integración de MAGIIS con los gateways de pago.

> **BL-036** (2026-05-13) — Pedido del líder técnico: arrancar con pruebas básicas que confirmen las llamadas API funcionan en el flujo actual. Sirven como **red de seguridad** para detectar regresiones ANTES de correr la suite E2E.

## Estructura

```
api/
├── magiis-backend/          🔴 TODO — API contra backend MAGIIS
│   ├── hold-capture.api.spec.ts   (POST /travels + capture)
│   ├── webhook-callback.api.spec.ts (procesamiento de webhooks Stripe/Authorize)
│   └── wallet-link.api.spec.ts    (vinculación de tarjeta)
└── authorize-sandbox/       🟡 Plantilla creada, requiere credenciales sandbox
    ├── contract-happy.api.spec.ts    (Visa/MC/Amex + CVV 900 → Response Code 1)
    ├── contract-decline.api.spec.ts  (ZIP 46282 → Response Code 2)
    └── contract-cvv-avs.api.spec.ts  (CVV 901/904 + AVS 46205)
```

## Frente A — MAGIIS backend (🔴 pendiente)

Tests que invocan el backend MAGIIS directamente para validar el contrato MAGIIS ↔ gateway:

- Hold endpoint responde 2xx + estado `SEARCHING_DRIVER`.
- Capture endpoint actualiza viaje a `FINALIZADO` con `paymentReference`.
- Webhook callback de gateway → backend actualiza estado correctamente.
- Vincular tarjeta al wallet → endpoint responde + tarjeta aparece en listado.

**Bloqueante:** confirmar con backend MAGIIS los endpoints reales (paths, payloads, auth headers). Reutilizar `tests/shared/utils/apiClient.ts` (ya integrado con `getCredentialsForRole`).

## Frente B — Authorize.net sandbox (🟡 plantilla lista)

Tests "contract" que envían requests directos al sandbox Authorize.net y validan que los triggers documentados producen los códigos esperados.

**Endpoint:** `https://apitest.authorize.net/xml/v1/request.api` (POST JSON).

**Cobertura inicial (3 specs):**

| Spec | TCs cubiertos | Trigger |
|---|---|---|
| `contract-happy.api.spec.ts` | TS-AUTHORIZE-TC1001/1002/1003 | Visa/MC/Amex + CVV 900 → Response Code 1 |
| `contract-decline.api.spec.ts` | TS-AUTHORIZE-TC1011 | ZIP 46282 → Response Code 2 |
| `contract-cvv-avs.api.spec.ts` | TS-AUTHORIZE-TC1021/1023/1031 | CVV 901/904 + ZIP 46205 |

### Configuración

Setear en `.env.test`:

```env
AUTHORIZE_API_LOGIN_ID=tu_login_id_sandbox_20_chars_max
AUTHORIZE_TRANSACTION_KEY=tu_txn_key_sandbox_16_chars_max
```

Sin estas variables, los specs se **skipean automáticamente** con mensaje claro (no rompen la suite). Ver `tests/shared/utils/authorize-api-client.ts:hasAuthorizeCredentials()`.

### Cómo correr

```bash
# Solo los specs Authorize sandbox
npx playwright test tests/features/gateway-pg/api/authorize-sandbox --project=chromium

# Toda la carpeta api/
npx playwright test tests/features/gateway-pg/api --project=chromium
```

Ojo: estos specs NO usan browser (solo `request` fixture de Playwright), pero el `--project=chromium` sigue siendo requerido por la config del proyecto. Es eficiente porque no hay overhead de navegador.

## Patrón canónico

```typescript
import { test, expect } from '@playwright/test';
import { AUTHORIZE_CARDS } from '../../../../fixtures/gateways/authorize/card-policy';
import { AuthorizeApiClient, hasAuthorizeCredentials } from '../../../../shared/utils/authorize-api-client';

test.describe('[BL-036][API] Suite name', () => {
  test.skip(!hasAuthorizeCredentials(), 'AUTHORIZE_API_LOGIN_ID/TRANSACTION_KEY no seteadas');

  test('descripción del test', async ({ request }) => {
    const client = new AuthorizeApiClient(request);

    const response = await client.authOnlyTransaction(
      AUTHORIZE_CARDS.SUCCESS,
      '10.00',
      `bl-036-${test.info().title}-${Date.now()}`, // refId merchant-side
    );

    expect(response.transactionResponse?.responseCode).toBe('1');
  });
});
```

## Operaciones soportadas por `AuthorizeApiClient`

| Método | Operación Authorize | Uso |
|---|---|---|
| `authOnlyTransaction(card, amount, refId?)` | Hold (autorización sin captura) | Validar approve/decline iniciales |
| `authCaptureTransaction(card, amount, refId?)` | Auth + capture en una llamada | Validar cobro inmediato |
| `priorAuthCapture(refTransId, amount, refId?)` | Capturar un authOnly previo | Validar capture posterior (separado del hold) |
| `voidTransaction(refTransId, refId?)` | Void de transacción no-settled | Validar cancelación pre-settlement |

## Plan de extensión

Cuando lleguen las credenciales sandbox (paso 1 de `BL-025` / `docs/gateway-pg/authorize/EXTERNAL-BLOCKERS.md`):

1. Setear `AUTHORIZE_API_LOGIN_ID` + `AUTHORIZE_TRANSACTION_KEY` en `.env.test`.
2. Correr los 3 specs piloto. Esperado: 7/7 verde (3 happy + 1 decline + 3 cvv/avs).
3. Extender la cobertura agregando specs para:
   - Partial Authorization (ZIP 46225)
   - Prepaid Authorization (ZIP 46226/46227/46228)
   - Hold + Capture combinados (`authOnlyTransaction` → `priorAuthCapture`)
   - Void de hold no-settled
4. Cuando MAGIIS backend exponga sus endpoints documentados, crear el frente A (`api/magiis-backend/`).

## Referencias

- [`AuthorizeApiClient`](../../../shared/utils/authorize-api-client.ts) — wrapper Playwright
- [`AUTHORIZE_CARDS`](../../../fixtures/gateways/authorize/card-policy.ts) — namespace semántico de cards
- [`docs/gateway-pg/authorize/ARCHITECTURE.md`](../../../../docs/gateway-pg/authorize/ARCHITECTURE.md) — arquitectura completa
- [`docs/gateway-pg/authorize/EXTERNAL-BLOCKERS.md`](../../../../docs/gateway-pg/authorize/EXTERNAL-BLOCKERS.md) — sandbox keys
- [Authorize.net API Reference](https://developer.authorize.net/api/reference/index.html)
