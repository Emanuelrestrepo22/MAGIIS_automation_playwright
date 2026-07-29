/**
 * TCs: TS-EBIZ-TC1108 · TC1109 · TC1110 · TC1111 · TC1112 · TC1113 · TC1114 · TC1115 · TC1116
 * Feature: Cargo a Bordo con eBizCharge — cobro del conductor al finalizar el viaje
 * Tags: @gateway @ebizcharge @cargo-a-bordo @regression
 *
 * CONSUMIDOR THIN de la factory CARGO (`_parametrized/factories/cargo-a-bordo.factory.ts`):
 * los 9 casos portables (app pax / colaborador / empresa individuo × happy · decline genérico ·
 * decline por CVV). eBizCharge soporta exactamente los 3 intents que la taxonomía CARGO necesita
 * (HAPPY_NO_AUTH · DECLINE_AUTHORIZE · DECLINE_INVALID_CVC) → los 9 se generan completos, sin
 * casos omitidos.
 *
 * Estado eBizCharge (registry `data/xray-keys.ts`):
 *   - `cargoTcIds` poblado desde `docs/gateway-pg/ebizcharge/matriz_cases.md` (personal
 *     TC1108-1110, colaborador TC1111-1113, empresa TC1114-1116) — CARGO es la única área eBiz
 *     completa 9/9 → los títulos llevan el corchete `[TS-EBIZ-TCxxxx]`.
 *   - `cargo` (keys MG) TODO `null`: eBizCharge aún sin NINGUNA issue MG creada (`id-map.json` →
 *     `summary.ebizcharge.with_mg_key = 0`) ⇒ SIN annotations tms (unmapped visible en el
 *     reporter; jamás inventar keys). Poblar cuando QA cree las issues espejo en MG.
 *   - Gate de credenciales: `adapter.isConfigured()` exige EBIZ_MERCHANT_USER +
 *     EBIZ_MERCHANT_PASSWORD + EBIZ_SECURITY_KEY en `.env.test` (ver `.env.example`) — sin ellas
 *     el describe se salta limpio (el spec COMPILA y se colecciona igual).
 *
 * ⚠️ TODO(live) — ambiente `apps-test` CAÍDO al 2026-07-28, NADA de esto corrió. Además eBiz
 * arrastra incógnitas propias, más grandes que las de Authorize:
 *   - FORM NATIVO SIN VERIFICAR: el form de tarjeta de eBiz no se observó en vivo en ningún
 *     flujo (ni carrier web ni el modal de cobro de la Driver App).
 *   - `adapter.nativeExtraField` SIN CONFIRMAR para eBiz: si el form pide un 5° campo, el
 *     `CardData` de la Driver App no lo modela y el cobro fallaría por dato faltante, no por la
 *     tarjeta — un rojo que NO sería el defecto que el TC promete validar.
 *   - Outcome del cobro DERIVADO del área HOLD (ver `helpers/cargo-driver-charge.ts`); los
 *     números trigger de eBiz salen de su fixture (`fixtures/gateways/ebizcharge/cards`) y su
 *     comportamiento tampoco se observó todavía.
 *   - Fase driver: requiere `APPIUM=1` + el teléfono físico dentro de la geocerca del pickup.
 */
import { defineCargoABordoSuite } from '@features/gateway-pg/specs/_parametrized/factories/cargo-a-bordo.factory';

// Los 9 casos portables. TC IDs de matriz en el título; keys MG null → sin annotations.
defineCargoABordoSuite('ebizcharge');
