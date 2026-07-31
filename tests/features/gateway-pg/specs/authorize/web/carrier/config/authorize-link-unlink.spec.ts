/**
 * TCs: TS-AUTHORIZE-TC1002 / TC1003 / TC1005 / TC1006 / TC1008 (docs/gateway-pg/authorize/matriz_cases.md §1)
 * Feature: Configuración de Pasarela Authorize.net en Magiis App Store — F4 · release gateway MG-178
 * Tags: @gateway @authorize @cfg @regression
 *
 * CONSUMIDOR THIN (S6, carrier/gateway-standardization): la suite completa vive en la
 * factory parametrizada `specs/_parametrized/factories/gateway-config.factory.ts`
 * (`defineGatewayConfigSuite`) — MISMA cobertura y keys que el spec F4 original:
 *   TC1002 linkValid → MG-220 · TC1003 linkInvalid → MG-221 · TC1005 unlink → MG-223 ·
 *   TC1006 exclusivity → MG-224 · TC1008 linkStatus → MG-226 (registry data/xray-keys.ts).
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
import { defineGatewayConfigSuite } from '@features/gateway-pg/specs/_parametrized/factories/gateway-config.factory';

// Los 5 casos base = cobertura del spec F4 original (TC1002/1003/1005/1006/1008).
defineGatewayConfigSuite('authorize');
