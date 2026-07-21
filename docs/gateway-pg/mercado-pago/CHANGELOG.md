# MercadoPago — Changelog

## 2026-07-20 — BL-026: SoT de datos + documentación (sin runtime)

- Análisis de la doc oficial <https://www.mercadopago.com.ar/developers/es/docs/your-integrations/test/cards> (Argentina/LATAM).
- **Hallazgo clave:** el outcome lo determina el **nombre del titular** (keyword: APRO/OTHE/SECU/FUND…), no el número/CVV/monto; número/CVV/exp fijos (`11/30`, CVV 123/1234); approved usa DNI `12345678`; sin 3DS.
- Poblado el slot `tests/fixtures/gateways/mercado-pago/`:
  - `cards.ts` — `MercadoPagoTestCard` + `MP_TEST_CARDS` (16 keywords de estado) + catálogo `MP_CARD_CATALOG` (5 tarjetas crédito/débito por marca).
  - `card-policy.ts` — namespace `MP_CARDS`.
  - `card-resolver.ts` — `resolveCard(key)` + `listMercadoPagoCardIds()`.
  - `README.md` — keywords + catálogo + triggers.
- Conectado al resolver cross-gateway (`_shared/resolver.ts`): `MERCADO_PAGO_INTENT_MAP` (`HAPPY_NO_AUTH`→APRO, `DECLINE_AUTHORIZE`→OTHE, `DECLINE_INVALID_CVC`→SECU) + `normalizeMercadoPagoCard()` (holderName pasa como trigger). `SUPPORTED_INTENTS_BY_GATEWAY['mercado-pago']` = 3 intents. El `case 'mercado-pago'` ya no lanza "no soportado".
- Documentación QA: `docs/gateway-pg/mercado-pago/{README, ARCHITECTURE, matriz_cases, TRACEABILITY, EXTERNAL-BLOCKERS, CHANGELOG}.md`.
- `tsc --noEmit`: OK (sin errores en los archivos de MP).
- **Pendiente (runtime):** POM + specs, bloqueado por modelo de integración backend + confirmación de uso en PROD LATAM (ver EXTERNAL-BLOCKERS.md).
