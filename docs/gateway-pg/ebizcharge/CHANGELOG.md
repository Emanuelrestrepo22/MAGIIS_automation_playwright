# eBizCharge — Changelog

## 2026-07-26 — Fase 4: derivación determinista desde el L1 Stripe (sin 3DS) + ID-MAP

- Derivación con `scripts/ai/derive-gateway-matrix.mjs` + delta `scripts/ai/gateway-deltas/ebizcharge.json` (dry-run verificado antes de aplicar).
- **94 TCs nuevos** desde `TC1050+` (rangos espejo de authorize §6 — ver sección nueva en `TRACEABILITY.md`): `TC1050..TC1070` CFG + alta carrier, `TC1100..TC1116` App Pax + cargo a bordo, `TC1200..TC1255` contractor / Quote / recurrentes / operaciones. 20 secciones de flujo nuevas en `matriz_cases.md`; los 17 TCs outcome-level (`TC1001..TC1041`) quedan intactos.
- Precondiciones extra documentadas por sección: alta de tarjeta requiere `placeId` del pax; vinculación de pasarela requiere `zipCode` del carrier.
- Exclusiones (mismas clases que Authorize, por decisión del briefing Fase 4): 89 `@3ds` + 15 `phase2` + 9 §3.2 + 17 delta-config (always_authenticate 3184, lost/stolen/insufficient/Radar análogos). Nota: eBiz sí expone code 51 / Fraud Profiler — ya cubiertos como exclusivos `TC1012` / `TC1030/1031`.
- **`normalized-test-cases.json` (L1 eBizCharge)** — 111 casos (17 existentes + 94 derivados), `total = cases.length` verificado, **cero `@3ds`** (assert del script).
- **`ID-MAP.md`** (GENERATED) + puntero en `TRACEABILITY.md` — trazabilidad TS-ID ↔ MG-key ↔ spec desde `docs/gateway-pg/id-map.json` (keys MG CFG eBiz aún `null` en `xray-keys.ts`: no se fabrican).

## 2026-07-20 — BL-027: SoT de datos + documentación (sin runtime)

- Análisis de la doc oficial <https://developer.ebizcharge.net/connect/docs/test-credit-card-numbers>.
- **Hallazgo clave:** el outcome lo determina el **número de tarjeta** (como Stripe, no CVV/ZIP como Authorize); exp fija `0930`; sin 3DS.
- Poblado el slot `tests/fixtures/gateways/ebizcharge/`:
  - `cards.ts` — `EbizTestCard` + `EBIZ_TEST_CARDS` (approved default, 14 declines, CVV2 clave, fraud, delays) + tablas de referencia completas (`EBIZ_AVS_REFERENCE`, `EBIZ_CVV2_REFERENCE`, `EBIZ_CAVV_REFERENCE`, `EBIZ_CARD_LEVEL_REFERENCE`).
  - `card-policy.ts` — namespace `EBIZ_CARDS`.
  - `card-resolver.ts` — `resolveCard(key)` + `listEbizCardIds()`.
  - `README.md` — tablas + triggers.
- Conectado al resolver cross-gateway (`_shared/resolver.ts`): `EBIZCHARGE_INTENT_MAP` (`HAPPY_NO_AUTH`, `DECLINE_AUTHORIZE`, `DECLINE_INVALID_CVC`) + `normalizeEbizchargeCard()`. `SUPPORTED_INTENTS_BY_GATEWAY.ebizcharge` = 3 intents. El `case 'ebizcharge'` ya no lanza "no soportado".
- Documentación QA: `docs/gateway-pg/ebizcharge/{README, ARCHITECTURE, matriz_cases, TRACEABILITY, EXTERNAL-BLOCKERS, CHANGELOG}.md`.
- `tsc --noEmit`: OK (sin errores en los archivos de eBiz).
- **Pendiente (runtime):** POM + specs, bloqueado por modelo de integración backend + confirmación de uso en PROD (ver EXTERNAL-BLOCKERS.md).
