# eBizCharge — Changelog

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
