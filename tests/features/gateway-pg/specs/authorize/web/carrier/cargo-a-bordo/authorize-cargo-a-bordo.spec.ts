/**
 * TCs: TS-AUTHORIZE-TC1081 · TC1082 · TC1083 · TC1096 · TC1097 · TC1098 · TC1111 · TC1112 · TC1105
 * Feature: Cargo a Bordo con Authorize.Net — cobro del conductor al finalizar el viaje
 * Tags: @gateway @authorize @cargo-a-bordo @regression
 *
 * CONSUMIDOR THIN de la factory CARGO (`_parametrized/factories/cargo-a-bordo.factory.ts`):
 * los 9 casos portables (app pax / colaborador / empresa individuo × happy · decline genérico ·
 * decline por CVV). Authorize soporta 4 intents canónicos, así que los 9 se generan completos.
 *
 * Estado Authorize (registry `data/xray-keys.ts`):
 *   - `cargoTcIds` poblado desde `docs/gateway-pg/authorize/matriz_cases.md` §7 (personal
 *     TC1081-1083), §8 (colaborador TC1096-1098) y §9 (empresa TC1111/1112 + TC1105 "CVC
 *     incorrecto") → los títulos llevan el corchete `[TS-AUTHORIZE-TCxxxx]`.
 *   - `cargo` (keys MG) TODO `null`: no existe ningún Test Xray espejo del área CARGO
 *     (`id-map.json` → `summary.authorize.with_mg_key = 9` = 8 CFG + 1 WAL) ⇒ SIN annotations
 *     tms (unmapped visible en el reporter; jamás inventar keys). Poblar cuando QA cree las
 *     issues en MG.
 *   - Gate de credenciales: `adapter.isConfigured()` exige AUTHORIZE_API_LOGIN_ID +
 *     AUTHORIZE_TRANSACTION_KEY en `.env.test` — sin ellas el describe se salta limpio (el spec
 *     COMPILA y se colecciona igual).
 *
 * ⚠️ TODO(live) — ambiente `apps-test` CAÍDO al 2026-07-28, NADA de esto corrió:
 *   - Fase web: el alta con método "Cargo a Bordo" sobre el carrier con Authorize vinculada no
 *     se observó (la cobertura Authorize viva hoy es CFG + WAL + hold).
 *   - Fase driver: requiere `APPIUM=1` + el teléfono físico dentro de la geocerca del pickup.
 *     El outcome esperado del cobro está DERIVADO del área HOLD (ver
 *     `helpers/cargo-driver-charge.ts`), no observado en el modal de cobro de la Driver App.
 *   - Los declines de Authorize dependen de la POLÍTICA DE LA CUENTA, no sólo del trigger:
 *     CVV requiere el filtro Card Code Verification con `N = Decline` (decisión D-7 del líder de
 *     QA, 2026-07-28). Sin ese filtro el caso CVV queda rojo legítimamente — el fallo apuntaría
 *     a la config de la cuenta, que es lo correcto.
 */
import { defineCargoABordoSuite } from '@features/gateway-pg/specs/_parametrized/factories/cargo-a-bordo.factory';

// Los 9 casos portables. TC IDs de matriz en el título; keys MG null → sin annotations.
defineCargoABordoSuite('authorize');
