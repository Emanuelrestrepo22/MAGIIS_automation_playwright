/**
 * TCs: TS-STRIPE-TC1001 – TC1008 (docs/gateway-pg/stripe/matriz_cases.md) — los 8 casos.
 * Feature: Configuración de Pasarela Stripe en Magiis App Store
 * Tags: @gateway @stripe @cfg @regression
 *
 * CONSUMIDOR THIN de la factory CFG (S6, carrier/gateway-standardization). Mapeo TC ID →
 * key Xray (registry `data/xray-keys.ts`):
 *   TC1001 viewUnlinked       → MG-211
 *   TC1002 linkValid          → MG-212
 *   TC1003 linkInvalid        → MG-213
 *   TC1004 cancelUnlink       → MG-214
 *   TC1005 unlink             → MG-215
 *   TC1006 exclusivity        → MG-216
 *   TC1007 reloadPersistence  → MG-217
 *   TC1008 linkStatus         → MG-218
 *
 * DES-FIXME F5 (carrier/stripe-full-iteration): los 3 casos OAuth (TC1002/TC1003/TC1008)
 * que vivían `fixme` en este consumidor ahora los genera la factory con el driver de link
 * Stripe (OAuth Connect test-mode — `linkStripeViaConnect` / `expectStripeLinkRejected` /
 * `expectStripeLinkStatusOk` del POM AppStoreGatewaysPage, keys @atc MG-212/213/218).
 * Semántica TC1003 en Stripe: NO hay credenciales que rechazar (es OAuth) — el caso
 * ejercita el ABANDONO del consent sin autorización (MVP honesto del AC; el affordance
 * "deny" explícito de Connect queda TODO(live), ver docstring MG-213 del POM).
 *
 * ⚠️ FRAGILE/TODO(live): selectores del onboarding Connect hosteado portados del record
 * legacy verificado (agentic-qa-boilerplate/tests/gateway-legacy/link-stripe-gateway.test.ts);
 * statuses de éxito `[200]` y urlPattern `vendor/stripe` ASUMIDOS (data/link-status-defaults.ts).
 * Confirmar y fijar en la primera corrida viva.
 * ⚠️ DESTRUCTIVO EN RUNTIME: vincular/desvincular pasarelas del carrier 1521 dispara
 * cleaningWallets en cascada. La factory skipea limpio sin GATEWAY_ALLOW_DESTRUCTIVE_SWITCH.
 */
import {
	defineGatewayConfigSuite,
	GATEWAY_CFG_ALL_CASES
} from '@features/gateway-pg/specs/_parametrized/factories/gateway-config.factory';

// Los 8 casos de matriz (TC1001..TC1008) — driver OAuth Connect incluido (F5).
defineGatewayConfigSuite('stripe', { cases: GATEWAY_CFG_ALL_CASES });
