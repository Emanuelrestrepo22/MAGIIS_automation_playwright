/**
 * TCs: TS-AUTHORIZE-TC1001..TC1008 (docs/gateway-pg/authorize/matriz_cases.md §1) — los 8 casos.
 * Feature: Configuración de Pasarela Authorize.net en Magiis App Store — F4 · release gateway MG-178
 * Tags: @gateway @authorize @cfg @regression
 *
 * CONSUMIDOR THIN (S6, carrier/gateway-standardization): la suite completa vive en la
 * factory parametrizada `specs/_parametrized/factories/gateway-config.factory.ts`
 * (`defineGatewayConfigSuite`). Mapeo TC ID → key Xray (registry `data/xray-keys.ts`):
 *   TC1001 viewUnlinked       → MG-219
 *   TC1002 linkValid          → MG-220
 *   TC1003 linkInvalid        → MG-221
 *   TC1004 cancelUnlink       → MG-222
 *   TC1005 unlink             → MG-223
 *   TC1006 exclusivity        → MG-224
 *   TC1007 reloadPersistence  → MG-225
 *   TC1008 linkStatus         → MG-226
 *
 * COBERTURA 1:1 CON EL ATR (auditoría 2026-07-28): el execution por pasarela MG-558 lleva
 * las 8 keys CFG de Authorize, pero este consumidor pasaba solo `GATEWAY_CFG_BASE_CASES`
 * (5 casos) → MG-219 / MG-222 / MG-225 quedaban sin automatización pese a que los casos
 * `viewUnlinked` / `cancelUnlink` / `reloadPersistence` YA existen en la factory. Se pasa
 * `GATEWAY_CFG_ALL_CASES` para cerrar el hueco: 8 tests generados = 8 keys CFG del ATR.
 * Authorize tiene link driver (modal de credenciales modelado en el POM), así que los 8
 * casos son soportados — no hay `fixme` como en el consumidor Stripe (OAuth Connect).
 *
 * ⚠️⚠️ DESTRUCTIVO EN RUNTIME: vincular/desvincular Authorize desvincula la pasarela activa
 * del carrier 1521 → cleaningWallets en cascada (borra la tarjeta 4242 del pax). La factory
 * skipea limpio sin GATEWAY_ALLOW_DESTRUCTIVE_SWITCH=true; correr SOLO en ventana exclusiva.
 * TEARDOWN MANUAL: al terminar, el carrier queda con Authorize vinculado — restaurar con
 * `new GatewaySwitchSteps({ page }).restoreStripe()` (hoy INCOMPLETO: OAuth Connect
 * test-mode + re-seed de tarjeta pendientes, ver TODOs del Step).
 *
 * GATE DE DATOS: requiere AUTHORIZE_API_LOGIN_ID + AUTHORIZE_TRANSACTION_KEY en .env.test
 * (la factory gatea vía `adapter.isConfigured()` — mismas keys que `hasAuthorizeCredentials`).
 *
 * ✅ RECONCILIADO EN VIVO (HANDOFF-live-reconciliation-2026-07-24): selectores del modal en
 * el POM AppStoreGatewaysPage. QUIRK 500/409-en-éxito del link → `adapter.linkSuccessStatuses`.
 */
import {
	defineGatewayConfigSuite,
	GATEWAY_CFG_ALL_CASES
} from '@features/gateway-pg/specs/_parametrized/factories/gateway-config.factory';

// Los 8 casos de matriz (TC1001..TC1008) = las 8 keys CFG Authorize del execution MG-558.
defineGatewayConfigSuite('authorize', { cases: GATEWAY_CFG_ALL_CASES });
