# Trazabilidad — Matrices Authorize.net Gateway PG

> **Propósito:** mapa bidireccional Stripe ↔ Authorize.net y catálogo de intents canónicos cross-gateway. Define qué se puede portar de Stripe a Authorize y qué no.
> **Effective date:** 2026-05-13
> **Fuentes consumidas:**
> - [`matriz_cases.md`](./matriz_cases.md) — TCs canónicos Authorize Parte 1.
> - [`matriz_cases2.md`](./matriz_cases2.md) — TCs Authorize Parte 2 (wallet, refund, void, stored creds).
> - [`docs/gateway-pg/stripe/matriz_cases.md`](../stripe/matriz_cases.md) — referencia Stripe.
> - [`tests/fixtures/gateways/_shared/resolver.ts`](../../../tests/fixtures/gateways/_shared/resolver.ts) — resolver cross-gateway con `AUTHORIZE_INTENT_MAP`.

---

## 1. Capas y fuentes de verdad

| Capa | Archivos | Rol | Fuente / Generado |
| --- | --- | --- | --- |
| **L0 — Fuente humana** | [`matriz_cases.md`](./matriz_cases.md), [`matriz_cases2.md`](./matriz_cases2.md) | Documentación QA editable por humanos | Fuente |
| **L1 — Fuente estructurada** | `normalized-test-cases.json` (pendiente — se generará con BL-025 runtime) | Contrato canónico consumible por scripts | Generado desde L0 |
| **L2 — Fuente binaria** | `.xlsx` Authorize (pendiente — se generará con BL-025 runtime) | Matriz operativa QA manual | Sincronizado desde L1 |
| **L3 — Documentos derivados** | [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`EXTERNAL-BLOCKERS.md`](./EXTERNAL-BLOCKERS.md), [`CHANGELOG.md`](./CHANGELOG.md) | Reportes / racionales de decisiones | Generado desde L0 / contexto |
| **L4 — Código Playwright** | `tests/features/gateway-pg/specs/authorize/**/*.spec.ts` (11 specs UI/E2E) + `tests/features/gateway-pg/api/{authorize-formal,authorize-sandbox}/**` (5 specs API) — **ya implementado, ver §L4 abajo** | Implementación de los TCs | Referencia L0 vía IDs |
| **L5 — Cobertura** | `tests/coverage/authorize-*.md` (futuro) | Mapa TC ↔ spec, estado de cobertura | Generado desde L0 + L4 (gitignored) |
| **L6 — Resolver shared** | [`tests/fixtures/gateways/_shared/resolver.ts`](../../../tests/fixtures/gateways/_shared/resolver.ts) | Mapeo intents canónicos → fixtures concretos | Código TypeScript |

### L4 — Estado real de la implementación (actualizado 2026-07-28)

> ⚠️ **Corrección de doc-drift.** Este documento afirmaba que la carpeta de specs de Authorize estaba
> "vacía hasta BL-025". Eso quedó desactualizado: hoy existen **16 specs reales**. Auditoría de
> respaldo: `agentic-qa-boilerplate/.context/reports/automation-inventory-baseline-2026-07-25.md`.

| Área | Specs | Trazabilidad Xray |
| --- | --- | --- |
| **CFG** (link / unlink / exclusividad / status) | `specs/authorize/web/carrier/config/authorize-link-unlink.spec.ts` (consumidor thin de `gateway-config.factory.ts`) | MG-220 / MG-221 / MG-223 / MG-224 / MG-226 (vía `data/xray-keys.ts`) |
| **Smoke** | `specs/authorize/web/carrier/smoke/authorize-linked-smoke.spec.ts` | MG-225 (TC15 · persistencia de estado vinculado) |
| **Wallet** | `specs/authorize/web/carrier/wallet/authorize-add-card.spec.ts` | MG-285 |
| **Hold — "Ola A"** | `specs/authorize/web/carrier/hold/{personal-hold-on-happy,personal-hold-decline-generic,personal-hold-zip-mismatch,colaborador-hold-on-happy,empresa-hold-on-happy}.spec.ts` | ⚠️ sin Test Xray creado aún (gap conocido, ver `authorize-coverage-gap-2026-07-23.md`) |
| **Quote** | `specs/authorize/web/quote/personal-quote-no-hold-happy.spec.ts` | ⚠️ sin Test Xray creado aún |
| **Probe** (descubrimiento, no regresión) | `specs/authorize/probe/appstore-gateways-probe.spec.ts` | n/a por diseño |
| **API — formal** | `api/authorize-formal/allcards-regression.api.spec.ts` | MG-551 |
| **API — sandbox contract** | `api/authorize-sandbox/contract-{happy,decline,edge,cvv-avs}.api.spec.ts` | BL-036 (work item propio, fuera del idmap MG) |

---

## 2. Intents canónicos cross-gateway — qué soporta cada gateway

Este es el contrato del resolver `resolveCard({ gateway, intent })`. Si un intent no aplica a un gateway, el resolver **lanza un error explícito** (no devuelve `null`) para forzar al spec a hacer `test.skip` o `test.fixme`.

| Intent canónico | Stripe | Authorize | Comentario |
| --- | :-: | :-: | --- |
| `HAPPY_NO_AUTH` | ✓ | ✓ | Stripe: `SUCCESS_NO_3DS` (4242). Authorize: `SUCCESS` (4111…1111 + CVV 900 + ZIP 90210) |
| `HAPPY_AUTH` | ✓ | ✗ | Authorize sandbox **no expone 3DS**. Adapter `requires3ds: false`. Resolver lanza `"intent 'HAPPY_AUTH' no soportado por gateway 'authorize'"` |
| `FAIL_AUTH` | ✓ | ✗ | Idem — sin 3DS no hay fallo de challenge |
| `DECLINE_AUTHORIZE` | ✓ | ✓ | Stripe: `DECLINE_AUTHORIZE` (0002). Authorize: `DECLINE_GENERIC` (Visa 4111 + ZIP 46282 → Response Code 2) |
| `DECLINE_CAPTURE` | ✓ | ✗ | Authorize sandbox **no expone decline-en-capture**. Una vez aprobado el hold, el capture se settla a menos que sea voided manualmente |
| `DECLINE_INVALID_CVC` | ✓ | ✓ | Stripe: `DECLINE_INVALID_CVC` (0127). Authorize: `DECLINE_CVV` (Visa 4111 + CVV 901 → cvvResultCode "N") |

**Conclusión:** Authorize soporta 3 de 6 intents canónicos (50%). Toda parametrización cross-gateway debe checkear con `SUPPORTED_INTENTS_BY_GATEWAY.authorize` antes de iterar.

### 2.1 Patrón de skip explícito en specs parametrizados

```typescript
import { SUPPORTED_INTENTS_BY_GATEWAY, resolveCard } from 'tests/fixtures/gateways/_shared';

const ACTIVE_GATEWAYS: GatewayName[] = ['stripe', 'authorize']; // cuando BL-025 runtime esté listo

for (const gateway of ACTIVE_GATEWAYS) {
  for (const intent of ALL_INTENTS) {
    if (!SUPPORTED_INTENTS_BY_GATEWAY[gateway].includes(intent)) {
      test.skip(`[${gateway}/${intent}] no soportado por gateway`, () => {});
      continue;
    }
    test(`[${gateway}/${intent}] flujo`, async () => {
      const card = resolveCard({ gateway, intent });
      // ...
    });
  }
}
```

---

## 3. Mapping bidireccional TC Stripe ↔ TC Authorize

> **ID-MAP central:** [`ID-MAP.md`](./ID-MAP.md) (generado desde [`../id-map.json`](../id-map.json) por `scripts/ai/build-id-map.mjs`) — trazabilidad TS-ID ↔ MG-key ↔ spec, incluye los derivados Fase 4.

### 3.1 TCs Stripe con equivalente directo Authorize

> "Equivalente directo" = mismo flujo funcional, mismo portal, mismo tipo de usuario, mismo Hold ON/OFF. Sólo difiere la card fixture y el modelo de validación (response code en vez de status string).

| TC Stripe | Intent canónico | TC Authorize | Card Stripe | Card Authorize | Notas |
| --- | --- | --- | --- | --- | --- |
| `TS-STRIPE-TC1049` | `HAPPY_NO_AUTH` | `TS-AUTHORIZE-TC1011` | 4242…4242 | 4111…1111 + CVV 900 | Carrier personal Hold ON happy path |
| `TS-STRIPE-TC1050` | `HAPPY_NO_AUTH` | `TS-AUTHORIZE-TC1012` | 4242…4242 | 4111…1111 + CVV 900 | Carrier personal Hold OFF happy path |
| `TS-STRIPE-TC1059` | `DECLINE_AUTHORIZE` | `TS-AUTHORIZE-TC1016` | 4000…9995 | 4111…1111 + ZIP 46282 | Carrier personal Hold ON decline. Stripe usa `insufficient_funds`, Authorize usa `general decline` |
| `TS-STRIPE-TC1033` | `HAPPY_NO_AUTH` (card-new seed) | `TS-AUTHORIZE-TC1051` | 4242…4242 | 4111…1111 + CVV 900 | Carrier colaborador Hold ON Vincular tarjeta nueva (seed) |
| `TS-STRIPE-TC1035` | `HAPPY_NO_AUTH` (card-new) | `TS-AUTHORIZE-TC1052` | 4242…4242 | 4111…1111 + CVV 900 | Carrier colaborador Hold ON Vincular tarjeta nueva |
| `TS-STRIPE-TC1041` | `HAPPY_NO_AUTH` (card-existing) | `TS-AUTHORIZE-TC1053` | 4242…4242 (stored) | 4111…1111 + stored creds | Carrier colaborador Hold ON Usar tarjeta vinculada existente |
| `TS-STRIPE-TC1034` | `HAPPY_NO_AUTH` (card-new) | `TS-AUTHORIZE-TC1054` | 4242…4242 | 4111…1111 + CVV 900 | Carrier colaborador Hold OFF Vincular tarjeta nueva |
| `TS-STRIPE-TC1036` | `HAPPY_NO_AUTH` (card-existing) | `TS-AUTHORIZE-TC1055` | 4242…4242 (stored) | 4111…1111 + stored creds | Carrier colaborador Hold OFF Usar tarjeta vinculada existente |
| `TS-STRIPE-TC1065` | `HAPPY_NO_AUTH` (card-new) | `TS-AUTHORIZE-TC1061` | 4242…4242 | 4111…1111 + CVV 900 | Carrier empresa individuo Hold ON nueva |
| `TS-STRIPE-TC1067` | `HAPPY_NO_AUTH` (card-existing) | `TS-AUTHORIZE-TC1062` | 4242…4242 (stored) | stored | Carrier empresa individuo Hold ON existente |
| `TS-STRIPE-TC1066` | `HAPPY_NO_AUTH` (card-new) | `TS-AUTHORIZE-TC1063` | 4242…4242 | 4111…1111 + CVV 900 | Carrier empresa individuo Hold OFF nueva |
| `TS-STRIPE-TC1068` | `HAPPY_NO_AUTH` (card-existing) | `TS-AUTHORIZE-TC1064` | 4242…4242 (stored) | stored | Carrier empresa individuo Hold OFF existente |
| `TS-STRIPE-TC1009` | `HAPPY_NO_AUTH` | `TS-AUTHORIZE-TC1071` | 4242…4242 | 4111…1111 + CVV 900 | App Pax personal Hold ON nueva |
| `TS-STRIPE-TC1017` | `HAPPY_NO_AUTH` (card-new) | `TS-AUTHORIZE-TC1075` | 4242…4242 | 4111…1111 + CVV 900 | App Pax business Hold ON nueva |
| `TS-STRIPE-TC1019` | `HAPPY_NO_AUTH` (card-existing) | `TS-AUTHORIZE-TC1076` | 4242…4242 (stored) | stored | App Pax business Hold ON existente |
| `TS-STRIPE-TC1081` | `HAPPY_NO_AUTH` (cargo a bordo) | `TS-AUTHORIZE-TC1081` | 4242…4242 | 4111…1111 + CVV 900 | Carrier personal cargo a bordo happy |
| `TS-STRIPE-TC1082` | `DECLINE_AUTHORIZE` (cargo a bordo) | `TS-AUTHORIZE-TC1082` | 4000…0002 | 4111…1111 + ZIP 46282 | Carrier personal cargo a bordo decline genérico |
| `TS-STRIPE-TC1085` | `DECLINE_INVALID_CVC` (cargo a bordo) | `TS-AUTHORIZE-TC1083` | 0127 | 4111…1111 + CVV 901 | Carrier personal cargo a bordo CVC fail |
| `TS-STRIPE-TC1096` | `HAPPY_NO_AUTH` (cargo a bordo) | `TS-AUTHORIZE-TC1096` | 4242…4242 | 4111…1111 + CVV 900 | Carrier colaborador cargo a bordo happy |
| `TS-STRIPE-TC1111` | `HAPPY_NO_AUTH` (cargo a bordo) | `TS-AUTHORIZE-TC1111` | 4242…4242 | 4111…1111 + CVV 900 | Carrier empresa individuo cargo a bordo happy |
| `TS-STRIPE-TC1122` | `HAPPY_NO_AUTH` (wallet remove) | `TS-AUTHORIZE-TC1221` | 4000…3155 (3DS, vinculada) | 4111…1111 (vinculada) | Wallet eliminar tarjeta vinculada — Authorize no aplica "3DS vinculada" |
| `TS-STRIPE-P2-TC001` | `HAPPY_NO_AUTH` | `TS-AUTHORIZE-TC1201` | 4242…4242 | 4111…1111 + CVV 900 | Portal Contractor vinculación + viaje Hold ON |
| `TS-STRIPE-P2-TC002` | `HAPPY_NO_AUTH` | `TS-AUTHORIZE-TC1202` | 4242…4242 | 4111…1111 + CVV 900 | Portal Contractor vinculación + viaje Hold OFF |
| `TS-STRIPE-P2-TC003` | `HAPPY_NO_AUTH` (card-existing) | `TS-AUTHORIZE-TC1203` | 4242…4242 (stored) | stored | Portal Contractor selección + viaje Hold ON |
| `TS-STRIPE-P2-TC004` | `HAPPY_NO_AUTH` (card-existing) | `TS-AUTHORIZE-TC1204` | 4242…4242 (stored) | stored | Portal Contractor selección + viaje Hold OFF |
| `TS-STRIPE-P2-TC090` | `DECLINE_AUTHORIZE` | `TS-AUTHORIZE-TC1205` | 4000…0002 | 4111…1111 + ZIP 46282 | Portal Contractor tarjeta declinada Hold ON |

### 3.2 TCs Stripe que NO migran a Authorize

> **Razón:** el comportamiento Stripe no es replicable en Authorize sandbox.

| TC Stripe | Razón de no-migración |
| --- | --- |
| `TS-STRIPE-TC1013, TC1014, TC1015, TC1016` | 3DS — Authorize no expone 3DS |
| `TS-STRIPE-TC1021..TC1024` | 3DS business App Pax — idem |
| `TS-STRIPE-TC1037..TC1040` | 3DS carrier colaborador — idem |
| `TS-STRIPE-TC1045..TC1048` | 3DS carrier colaborador con stored — idem |
| `TS-STRIPE-TC1051, TC1057, TC1061..TC1064` | Reintento de 3DS desde detalle de viaje — Authorize no tiene flujo de retry challenge |
| `TS-STRIPE-TC1053..TC1056` | 3DS carrier personal — idem |
| `TS-STRIPE-TC1069..TC1072` | 3DS empresa individuo — idem |
| `TS-STRIPE-TC1077..TC1080` | 3DS empresa individuo con stored — idem |
| `TS-STRIPE-TC1092..TC1095` | Cargo a Bordo con 3DS obligatorio — Authorize no |
| `TS-STRIPE-TC1107..TC1110` | Cargo a Bordo colaborador con 3DS — idem |
| `TS-STRIPE-P2-TC005, TC006` | Portal Contractor 3DS — idem |
| `TS-STRIPE-P2-TC015..TC018, TC023..TC026, TC031..TC034` | Quote con 3DS — idem |
| `TS-STRIPE-TC1083` (fondos insuficientes) | Authorize no expone "insufficient funds" como decline diferenciado — `46282` es el único decline genérico |
| `TS-STRIPE-TC1084` (tarjeta perdida) | Authorize sandbox no expone `lost_card` |
| `TS-STRIPE-TC1086` (tarjeta robada) | Authorize sandbox no expone `stolen_card` |
| `TS-STRIPE-TC1087` (CVC fail antifraude) | Parcialmente equivalente a `TS-AUTHORIZE-TC1083` (CVV mismatch), pero sin distinción "antifraude" — Authorize no tiene Radar |
| `TS-STRIPE-TC1088` (riesgo máximo Radar) | Authorize sin Radar; no equivalente |
| `TS-STRIPE-TC1089` (tarjeta siempre bloqueada Radar) | Idem |
| `TS-STRIPE-TC1090` (postal fail Radar) | Parcialmente cubierto por AVS `TS-AUTHORIZE-TC1099` (ZIP 46205) pero sin score Radar |
| `TS-STRIPE-TC1091` (dirección no disponible Radar) | Cubierto parcialmente por AVS `U` (ZIP 46209) si MAGIIS lo trata como antifraud |
| `TS-STRIPE-TC1059` decline-en-capture | Authorize sandbox no expone decline-en-capture (`9995` Stripe). Si se necesita validar el caso, mockear backend |

### 3.3 TCs Authorize exclusivos (sin equivalente Stripe)

| TC Authorize | Razón de exclusividad |
| --- | --- |
| `TS-AUTHORIZE-TC1023, TC1024` | CVV `902` (`should be on card`) y `903` (`issuer not certified`) — Stripe no diferencia este nivel de granularidad |
| `TS-AUTHORIZE-TC1025` | CVV `904` (`not processed`) — Stripe no expone status equivalente |
| `TS-AUTHORIZE-TC1031..TC1037` | AVS granular (codes N/W/X/Z/G/R/E) — Stripe no expone estos códigos crudos; Radar resume todo en score |
| `TS-AUTHORIZE-TC1041, TC1042, TC1043` | Partial / Prepaid authorization — Stripe maneja partial via `payment_intent.amount_capturable` pero sin sandbox equivalente |
| `TS-AUTHORIZE-TC1241..TC1247` | Stored credentials con `networkTransId` — Stripe usa `payment_method.id` (modelo distinto, no portable 1:1) |
| `TS-AUTHORIZE-TC1271..TC1274` | Void pre-settle — Stripe `paymentIntents.cancel` cubre solo pre-capture |
| `TS-AUTHORIZE-TC1281..TC1284` | Recurring Billing ARB — equivalente Stripe Subscriptions (pero MAGIIS aún no tiene viajes recurrentes confirmados) |
| `TS-AUTHORIZE-TC1321..TC1323` | Held for Review (Response Code 4) — Stripe `radar.early_fraud_warning` es distinto |

---

## 4. Mapa de impacto — qué tocar según el tipo de cambio

| Tipo de cambio | L0 | L1 | L2 | L3 | L4 | L5 |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| Renombrar descriptor (ej: `Hold ON`) | ✅ | ✅ (futuro) | ✅ (futuro) | ✅ | ✅ (`describe`) | ✅ |
| Agregar TC nuevo | ✅ | ✅ (futuro) | ✅ (futuro) | — | ✅ (draft) | ✅ |
| Cambiar prioridad | ✅ | ✅ | — | — | — | ✅ |
| Cambiar fixture `AUTHORIZE_CARDS.*` | — | — | — | ✅ ARCHITECTURE | ✅ | ✅ |
| Deprecar TC | ✅ | ✅ | ✅ | ✅ | 📝 comentario | ✅ |
| Agregar intent canónico | — | — | — | ✅ ARCHITECTURE | ✅ resolver | ✅ |

**Leyenda:** ✅ obligatorio · 📝 comentario inline · — no aplica · (futuro) cuando exista L1/L2

---

## 5. Orden canónico de sincronización

Cuando exista BL-025 runtime y se genere L1/L2:

```text
L0 (md) ──► L1 (json) ──► L2 (xlsx) ──► L3 (derivados) ──► L4 (specs) ──► L5 (coverage)
```

Por ahora (BL-025 🟡 pre-runtime), las únicas capas vigentes son **L0 + L3** (este directorio) + **L6 (resolver shared)**. L1/L2/L4/L5 se activan en orden cuando arranque runtime.

---

## 6. Convenciones de naming

### IDs de test cases Authorize

- Canónico: `TS-AUTHORIZE-TC####` (4 dígitos).
- Rangos:
  - `TC1001..TC1099` — configuración + alta carrier personal/colaborador/empresa.
  - `TC1100..TC1130` — alta App Pax + cargo a bordo.
  - `TC1200..TC1299` — Parte 2 (wallet, stored creds, refund, void, recurring).
  - `TC1300..TC1399` — E2E híbridos (Flow 1 + Flow 2 + Held for Review).
- No usar sufijos `-CARD-NEW` / `-CARD-EXISTING`: se diferencia con TCs distintos en la matriz (`TC1052` vs `TC1053`).
- No usar prefijo `P2-`: se diferencia con rango (`TC1200+`).

### Terminología en títulos

| Concepto | Usar | Evitar |
| --- | --- | --- |
| Acción del caso | `Validar ...` | `E2E ...`, `Test ...` |
| Tarjeta exitosa | `Tarjeta preautorizada exitosa (Visa 4111…1111 + CVV 900)` | `Tarjeta válida` |
| Tarjeta declinada | `Tarjeta declinada (ZIP 46282)` | `Tarjeta inválida`, `Tarjeta rechazada` |
| Hold | `Hold desde Alta de Viaje y Cobro desde App Driver` | `Hold y Cobro` solo |
| Sin Hold | `sin Hold desde Alta de Viaje, Cobro desde App Driver` | `Hold OFF` solo |
| CVV mismatch | `CVV mismatch (CVV 901)` | `CVV incorrecto` |
| AVS no match | `AVS no match (ZIP 46205)` | `dirección incorrecta` |

---

## 7. Checklist antes de mergear un cambio en matrices Authorize

- [ ] IDs nuevos siguen rango y no chocan con Stripe.
- [ ] Cada TC tiene card fixture identificada (`AUTHORIZE_CARDS.X`).
- [ ] Hold ON/OFF declarado explícitamente.
- [ ] Outcome esperado declarado como "Debería…" + response code Authorize.
- [ ] Si el TC tiene equivalente Stripe → agregar fila en sección 3.1 de este doc.
- [ ] Si el TC es exclusivo Authorize → agregar fila en sección 3.3.
- [ ] Si introduce un intent canónico nuevo → actualizar §2 + `AUTHORIZE_INTENT_MAP` en `_shared/resolver.ts`.
- [ ] [`CHANGELOG.md`](./CHANGELOG.md) registra el cambio con racional.

---

## 8. Quién ejecuta qué — delegación a agentes

| Fase | Agente responsable | Entrada | Salida |
| --- | --- | --- | --- |
| Análisis L0 → L1 | `qa-doc-analyst` (cuando BL-025 inicie) | matrices .md | `normalized-test-cases.json` Authorize |
| Drafts nuevos L1 → L4 | `playwright-draft-generator` | JSON | specs con `test.fixme()` |
| Refactor de specs parametrizados | `playwright-draft-generator` | JSON + specs Stripe actuales | specs con `for (gateway of ACTIVE_GATEWAYS)` |
| Mapping bidireccional Stripe ↔ Authorize | orquestador + revisión humana | matrices ambos gateways | tablas §3.1, §3.2, §3.3 |
| Sync resolver shared | `general-purpose` | matrices + intents canónicos | `_shared/resolver.ts` actualizado |

---

## 9. Historial de cambios canónicos

Para historial detallado ver [`CHANGELOG.md`](./CHANGELOG.md).

| Fecha | Cambio | Capas |
| --- | --- | --- |
| 2026-05-13 | Creación inicial de docs Authorize (este commit) | L0, L3 |
| 2026-05-13 | SoT canónica fixtures bajo umbrella `fixtures/gateways/authorize/` (BL-024 Fase 3) | L6 (resolver), código |
