# Authorize.net Matrix Changelog

Registro histórico de cambios aplicados a la documentación de la matriz Authorize.net / Gateway PG.

Sigue convenciones tipo [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
IDs canónicos: ver [`matriz_cases.md`](./matriz_cases.md) y [`matriz_cases2.md`](./matriz_cases2.md) (fuente de verdad).

---

## [2026-07-26] Fase 4 — Derivación determinista desde el L1 Stripe (sin 3DS) + ID-MAP

Derivación con `scripts/ai/derive-gateway-matrix.mjs` + delta declarativo `scripts/ai/gateway-deltas/authorize.json` (dry-run verificado antes de aplicar).

### Added

- **60 TCs nuevos** derivados de los 120 activos Stripe sin 3DS (94 candidatos tras exclusiones; 34 ya cubiertos por pins §3.1 / espejo CFG):
  - `TC1009/TC1010/TC1018` — carrier personal Hold OFF (variantes) en `matriz_cases.md` §2.1.
  - `TC1100..TC1102` — App Pax personal (Hold ON/OFF variantes) §5; `TC1103/TC1104` — App Pax business sin Hold §6; `TC1105` — cargo a bordo empresa individuo CVV mismatch §9.
  - `TC1200/TC1207..TC1219` — Flujo Quote (sección nueva §11 de `matriz_cases2.md`).
  - `TC1220/TC1228..TC1240/TC1248..TC1250` — Viajes Recurrentes (contractor / carrier colaborador / personal / empresa, §12-§15).
  - `TC1251..TC1260/TC1266..TC1279` — Reactivación, Clonación (cancelados/finalizados) y Edición (programados/conflicto), §16-§20.
- **`normalized-test-cases.json` (L1 Authorize)** — 164 casos (104 existentes + 60 derivados), `total = cases.length` verificado, **cero `@3ds`** (assert del script).
- **`ID-MAP.md`** (GENERATED) + puntero en `TRACEABILITY.md` §3 — trazabilidad TS-ID ↔ MG-key ↔ spec desde `docs/gateway-pg/id-map.json`.

### Excluded (no derivados — racional)

- Clases 1-2: 89 casos `@3ds` + 15 `phase2` deprecated/collapsed.
- Clase 3 (§3.2 explícitos, 9): `TC1059` (decline-en-capture/9995), `TC1083/1084/1086` (insufficient/lost/stolen), `TC1087..TC1091` (Radar).
- Delta-config (17): `TC1062` (always_authenticate 3184 = 3DS sin tag) + análogos lost/stolen/insufficient/Radar de cargo a bordo colaborador (`TC1098..TC1106`) y empresa (`TC1113..TC1121` salvo `TC1115`).

### Note

- IDs existentes intactos (regla dura: nunca renumerar). "## 11. Trazabilidad cruzada" pasó a §21 por inserción de las secciones §11-§20.

---

## [2026-07-20] Reconciliación fixtures ↔ guía oficial

Verificación de `tests/fixtures/gateways/authorize/` contra <https://developer.authorize.net/hello_world/testing_guide.html>.

### Verified

- ZIP `46225-46228` (partial/prepaid) **confirmados** contra la sección "Partial authorization responses" de la guía oficial (46225 → Partial $1.23; 46226/46227 → Prepaid $1.23/-$1.23; 46228 → Prepaid $0). Datos correctos — se conservan.
- Core CVV (900/901/904) y AVS (46204/46205/46282) ya coincidían con la fuente.

### Added (fixtures code — alineados a lo que ARCHITECTURE/matriz ya documentaban)

- `cards.ts` + `card-policy.ts`: promovidas a objetos de card las CVV `902` (S → `CVV_SHOULD_BE_PRESENT`) y `903` (U → `CVV_ISSUER_NOT_CERTIFIED`), y los AVS ZIP `46207` (R → `AVS_UNAVAILABLE`), `46208` (S → `AVS_NOT_SUPPORTED`), `46209` (U → `AVS_ADDRESS_UNAVAILABLE`). Antes solo estaban en la doc; ahora existen en la SoT ejecutable.
- `README.md` (fixture): tabla AVS/ZIP reconciliada con significados oficiales + tabla partial/prepaid con montos verificados.

### Note

- Los TCs `TS-AUTHORIZE-TC1023/1024/1036` que usaban "`SUCCESS` (override CVV/ZIP)" ahora pueden referenciar las keys dedicadas del policy.
- Triggers por **monto** ($70.xx) siguen **deprecados** (phased out 2011) — no se usan; se prefieren los ZIP.

---

## [2026-05-13] BL-025 Fase 1 — Documentación oficial creada

### Added

- **`docs/gateway-pg/authorize/`** — directorio canónico creado espejando `docs/gateway-pg/stripe/`:
  - `README.md` — overview del directorio, orden de lectura recomendado, links a fixtures + resolver shared.
  - `ARCHITECTURE.md` — arquitectura específica Authorize.net + diferencias clave contra Stripe:
    - Triggers por CVV/ZIP vs número (Stripe).
    - No 3DS — `authorizeGatewayAdapter.requires3ds = false` canónico.
    - Mapping MAGIIS Hold/Capture/NO_AUTORIZADO ↔ `authOnlyTransaction`/`priorAuthCaptureTransaction`/Response Code 2.
    - Tabla completa de operaciones (`Payment Transactions`, `Customer Profiles`, `Recurring Billing`, `Transaction Reporting`, `Fraud Management`, `Accept Suite`).
    - Modelo de integración probable (Accept.js / Accept Hosted / API directa) — pendiente confirmación.
    - Triggers consolidados (CVV 900/901/902/903/904 + ZIP 46201/46203-46217 + ZIP 46225-46228 partial/prepaid + ZIP 46282 decline).
    - Response codes 1/2/3/4 + message codes (I00001, E00001, E00003, E00004, E00008).
    - Comando aspiracional `pnpm test:test:gateway-pg:authorize` (pendiente BL-025 runtime).
  - `matriz_cases.md` — TCs canónicos `TS-AUTHORIZE-TC1001..TC1113`:
    - §1 Configuración pasarela (TC1001-TC1008).
    - §2 Carrier personal (happy paths + decline + CVV + AVS + partial/prepaid; TC1011-TC1043).
    - §3 Carrier colaborador (happy + decline + CVV; TC1051-TC1057).
    - §4 Carrier empresa individuo (happy + decline; TC1061-TC1065).
    - §5 App Pax personal (happy + decline; TC1071-TC1073).
    - §6 App Pax business (happy; TC1075-TC1076).
    - §7-§9 Cargo a Bordo (personal + colaborador + empresa; TC1081-TC1112).
  - `matriz_cases2.md` — TCs avanzados `TS-AUTHORIZE-TC1201..TC1323`:
    - §1 Portal Contractor (TC1201-TC1206).
    - §2 Wallet (eliminación + validación tarjeta nueva; TC1221-TC1227).
    - §3 Stored credentials con `networkTransId` (TC1241-TC1247).
    - §4 Refunds post-settlement (TC1261-TC1265).
    - §5 Voids pre-settlement (TC1271-TC1274).
    - §6 Recurring Billing ARB (TC1281-TC1284, scope opcional).
    - §7 Accept.js iframe edge cases (TC1291-TC1294).
    - §8-§9 E2E híbridos Flow 1 + Flow 2 (TC1301-TC1312).
    - §10 Held for Review fraud management (TC1321-TC1323).
  - `TRACEABILITY.md` — mapping bidireccional + intents canónicos:
    - §2 Intents canónicos soportados por gateway (3/6 Authorize vs 6/6 Stripe).
    - §3.1 Tabla de equivalencia directa TC Stripe ↔ TC Authorize (25 pares mapeados).
    - §3.2 TCs Stripe que NO migran a Authorize (3DS, decline-capture, Radar antifraud).
    - §3.3 TCs Authorize exclusivos (AVS granular, partial/prepaid, ARB, Held for Review).
  - `EXTERNAL-BLOCKERS.md` — 6 bloqueantes priorizados para destrabar BL-025 runtime:
    - §1 Sandbox keys (`AUTHORIZE_API_LOGIN_ID` + `AUTHORIZE_TRANSACTION_KEY`).
    - §2 Decisión líder sobre uso PROD MAGIIS.
    - §3 Modelo de integración (Accept.js / Hosted / API).
    - §4 POM web — selectores aún no documentados.
    - §5 Backend MAGIIS — soporte E2E híbrido routeando capture por gateway.
    - §6 Coordinación BL-024 ✅ / BL-025 🟡 / BL-028 🟡.

### Rationale

BL-024 Fase 3 (2026-05-13) consolidó la SoT de fixtures Authorize bajo `tests/fixtures/gateways/authorize/` y validó el resolver cross-gateway. El siguiente paso era **dejar la documentación QA Authorize completa** para que cuando el equipo dispare BL-025 runtime y BL-028 specs parametrizados, ya exista:

1. Trazabilidad de TCs (matrices completas).
2. Mapping bidireccional con Stripe (saber qué portar y qué no).
3. Catálogo explícito de bloqueantes para no perder tiempo descubriéndolos en runtime.
4. Decisiones arquitectónicas registradas (sin 3DS, sin decline-capture, intents canónicos parciales).

### Datos consumidos de fuentes oficiales

- Authorize.net Testing Guide: https://developer.authorize.net/hello_world/testing_guide.html
- API Reference: https://developer.authorize.net/api/reference/index.html
- Response Codes Reference: https://developer.authorize.net/api/reference/responseCodes.html

### Decisiones arquitectónicas registradas

| Decisión | Lugar | Racional |
| --- | --- | --- |
| `requires3ds: false` para Authorize | [`ARCHITECTURE.md`](./ARCHITECTURE.md) §8.1 | Authorize sandbox no expone 3DS; soporte legacy `cardholderAuthentication` deprecated |
| No modelar `DECLINE_CAPTURE` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) §8.2 | Sandbox no expone decline-en-capture; mockear backend si se necesita |
| Intents soportados: `HAPPY_NO_AUTH`, `DECLINE_AUTHORIZE`, `DECLINE_INVALID_CVC` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) §8.3 + [`TRACEABILITY.md`](./TRACEABILITY.md) §2 | Resolver cross-gateway lanza explícito en intents no soportados |
| Stored credentials con `networkTransId` | [`ARCHITECTURE.md`](./ARCHITECTURE.md) §8.4 | Modelo Authorize distinto a Stripe (`customer.id` + `payment_method.id`); impacta JourneyContext |
| Mismo número, distintos outcomes via (CVV+ZIP) | [`ARCHITECTURE.md`](./ARCHITECTURE.md) §8.5 | Justifica que `card-policy.ts` Authorize mapee a objetos completos (no strings) |
| Rangos de IDs `TS-AUTHORIZE-TC1001..` | [`TRACEABILITY.md`](./TRACEABILITY.md) §6 | No colisionar con Stripe; rangos por área (config / carrier / app pax / cargo a bordo / Parte 2 / E2E) |

### Cobertura mapeada

- **25 TCs Stripe ↔ Authorize con equivalente directo** (ver [`TRACEABILITY.md`](./TRACEABILITY.md) §3.1).
- **~80 TCs Stripe que NO migran a Authorize** (3DS family + decline-capture + Radar granular; ver §3.2).
- **~25 TCs Authorize exclusivos** sin equivalente Stripe (AVS granular, partial/prepaid, ARB, Held for Review; ver §3.3).

### Habilita

- **BL-025** (runtime POM Authorize) — checklist completo de bloqueantes a resolver antes de empezar.
- **BL-028** (specs parametrizados Authorize) — cuando BL-025 termine runtime, agregar `'authorize'` a `ACTIVE_GATEWAYS` y reusar el resolver.

### Restricciones cumplidas

- Sólo se modificó `docs/gateway-pg/authorize/`.
- No se tocaron `tests/fixtures/gateways/authorize/` ni código fuente.
- No se generaron `normalized-test-cases.json` ni `.xlsx` (esos son outputs de pipelines automatizados, no de análisis humano).
- No se inventaron selectores DOM ni endpoints MAGIIS (todo TODO marcado explícito).
- IDs Authorize arrancan en `TC1001` para no chocar con `TS-STRIPE-TCxxxx`.

### Pendiente (BL-025 runtime)

- POM Web Authorize (selectores form de pago Authorize en portal MAGIIS) — depende §3 + §4 de [`EXTERNAL-BLOCKERS.md`](./EXTERNAL-BLOCKERS.md).
- Variables env `AUTHORIZE_API_LOGIN_ID` + `AUTHORIZE_TRANSACTION_KEY` cargadas — §1.
- Confirmación líder MAGIIS PROD — §2.
- Backend MAGIIS routing por gateway en capture — §5.
- Primer spec piloto en `tests/features/gateway-pg/specs/authorize/` siguiendo el patrón parametrizado BL-028.
- Generación de `normalized-test-cases.json` Authorize cuando arranque ejecución real.

---

## [2026-05-13] BL-024 Fase 3 — SoT canónica bajo umbrella multi-gateway

> Cambio aplicado en `tests/fixtures/gateways/authorize/`, no en docs. Referenciado aquí por trazabilidad — el commit que lo introdujo es `a26aa35`.

### Changed

- **Fixtures movidos** de `tests/fixtures/authorize/` (legacy) a `tests/fixtures/gateways/authorize/` (canónico):
  - `cards.ts` — `AUTHORIZE_TEST_CARDS` registry con 11 entries cubriendo happy paths (Visa/MC/Amex/Discover) + unhappy (decline genérico, CVV mismatch/not-processed, AVS no-match/non-US, partial/prepaid auth).
  - `card-policy.ts` — namespace semántico `AUTHORIZE_CARDS` con 11 keys por intención (`SUCCESS`, `SUCCESS_MASTERCARD`, `SUCCESS_AMEX`, `SUCCESS_DISCOVER`, `DECLINE_GENERIC`, `DECLINE_CVV`, `CVV_NOT_PROCESSED`, `AVS_NO_MATCH`, `AVS_NON_US`, `PARTIAL_AUTH`, `PREPAID_ZERO`).
  - `card-resolver.ts` — `resolveCard(cardId)` + `listAuthorizeCardIds()`.
  - `README.md` — guía con tablas de triggers CVV y ZIP, referencia a doc oficial.

### Added

- **Resolver cross-gateway** `tests/fixtures/gateways/_shared/resolver.ts` mapea intents canónicos a Authorize:
  ```typescript
  const AUTHORIZE_INTENT_MAP: Partial<Record<CardIntent, AuthorizeCardId>> = {
    HAPPY_NO_AUTH: 'SUCCESS',
    DECLINE_AUTHORIZE: 'DECLINE_GENERIC',
    DECLINE_INVALID_CVC: 'DECLINE_CVV',
  };
  ```
- **Adapter declarativo** `tests/features/gateway-pg/helpers/adapters/authorizeGatewayAdapter.ts` con `requires3ds: false`.
- **Slot reservado** `tests/features/gateway-pg/specs/authorize/` con `README.md` documentando por qué está vacío y el patrón parametrizado recomendado.

### Trazabilidad

- Commit: `a26aa35` (umbrella + fixtures Authorize).
- Backlog: `docs/ops/BACKLOG.md` BL-024 ✅, BL-025 🟡, BL-026 🔴 slot, BL-027 🔴 slot.

---

*Documento mantenido siguiendo el patrón `docs/gateway-pg/stripe/CHANGELOG.md`. Toda corrección futura de fuente debe registrarse aquí con racional + referencia de commit/MR.*
