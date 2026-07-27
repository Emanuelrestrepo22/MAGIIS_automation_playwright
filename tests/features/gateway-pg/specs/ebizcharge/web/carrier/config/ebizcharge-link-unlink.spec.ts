/**
 * Feature: Configuración de Pasarela eBizCharge en Magiis App Store
 * Tags: @gateway @ebizcharge @cfg @regression
 *
 * CONSUMIDOR THIN de la factory CFG (S6, carrier/gateway-standardization) — espejo del
 * consumidor Authorize (5 casos base: linkValid/linkInvalid/unlink/exclusivity/linkStatus).
 *
 * Estado eBizCharge (registry data/xray-keys.ts):
 *   - Sin issues CFG en Jira ni TC IDs de matriz (TS-EBIZ-*) todavía → keys/TC `null`
 *     ⇒ títulos sin corchete y SIN annotations tms (unmapped visible en el reporter;
 *     jamás inventar keys). Completar el registry cuando QA cree las issues espejo en MG.
 *   - SKIP LIMPIO por defecto: `adapter.isConfigured()` exige EBIZ_MERCHANT_USER +
 *     EBIZ_MERCHANT_PASSWORD + EBIZ_SECURITY_KEY en .env.test (ver .env.example) — sin
 *     ellas el describe entero se salta (el spec COMPILA y se colecciona igual).
 *
 * ⚠️ FRAGILE/TODO(live): el modal de credenciales eBiz NO está verificado en vivo —
 * selectores candidatos en AppStoreGatewaysPage (S4); statuses de éxito del link `[200]`
 * ASUMIDOS (adapter S2). Confirmar y fijar en la primera corrida viva con EBIZ_* configuradas.
 * ⚠️ DESTRUCTIVO EN RUNTIME: mismo guard GATEWAY_ALLOW_DESTRUCTIVE_SWITCH que Authorize.
 */
import { defineGatewayConfigSuite } from '@features/gateway-pg/specs/_parametrized/factories/gateway-config.factory';

// Los 5 casos base (espejo del consumidor Authorize). Keys null → sin annotations.
defineGatewayConfigSuite('ebizcharge');
