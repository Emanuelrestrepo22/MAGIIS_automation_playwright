/**
 * Feature: Configuración de Pasarela eBizCharge en Magiis App Store
 * Tags: @gateway @ebizcharge @cfg @regression
 *
 * CONSUMIDOR THIN de la factory CFG (S6, carrier/gateway-standardization).
 *
 * Pide los 8 casos canónicos, no los 5 base: los 3 restantes (`viewUnlinked`,
 * `cancelUnlink`, `reloadPersistence`) ya están implementados en la factory y sus TC de
 * matriz existen (`TS-EBIZ-TC1050/1053/1056`), así que dejarlos afuera era regalar 3 casos
 * de cobertura a cambio de nada. `cancelUnlink` además cubre el paso "cancelar → sin
 * llamada" del TC de aviso de desvinculación (MG-165).
 *
 * Estado eBizCharge (registry data/xray-keys.ts):
 *   - TC IDs de matriz: **poblados** (TS-EBIZ-TC1050..1057) → los títulos llevan su
 *     `[TS-EBIZ-TCxxxx]` y son trazables contra `docs/gateway-pg/ebizcharge/matriz_cases.md`.
 *   - Keys MG de Jira: `null` todavía ⇒ SIN annotation `tms` (unmapped visible en el
 *     reporter; jamás inventar keys). Las que hay que crear están listadas en
 *     `docs/gateway-pg/ebizcharge/MG-KEYS-REQUEST.md`.
 *   - SKIP LIMPIO por defecto: `adapter.isConfigured()` exige EBIZ_MERCHANT_USER +
 *     EBIZ_MERCHANT_PASSWORD + EBIZ_SECURITY_KEY en .env.test (ver .env.example) — sin
 *     ellas el describe entero se salta (el spec COMPILA y se colecciona igual).
 *
 * ⚠️ FRAGILE/TODO(live): el modal de credenciales eBiz NO está verificado en vivo —
 * selectores candidatos en AppStoreGatewaysPage (S4); statuses de éxito del link `[200]`
 * ASUMIDOS (adapter S2). Confirmar y fijar en la primera corrida viva con EBIZ_* configuradas.
 * ⚠️ DESTRUCTIVO EN RUNTIME: mismo guard GATEWAY_ALLOW_DESTRUCTIVE_SWITCH que Authorize.
 */
import {
	defineGatewayConfigSuite,
	GATEWAY_CFG_ALL_CASES
} from '@features/gateway-pg/specs/_parametrized/factories/gateway-config.factory';

defineGatewayConfigSuite('ebizcharge', { cases: GATEWAY_CFG_ALL_CASES });
