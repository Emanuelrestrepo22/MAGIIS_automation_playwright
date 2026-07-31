/**
 * TCs: TS-STRIPE-TC1001 – TC1008 (docs/gateway-pg/stripe/matriz_cases.md)
 * Feature: Configuración de Pasarela Stripe en Magiis App Store
 * Tags: @gateway @stripe @cfg @regression
 *
 * CONSUMIDOR de la factory CFG (S6, carrier/gateway-standardization) — des-fixme de los
 * casos con implementación UI GENÉRICA (POM AppStoreGatewaysPage, agnóstico de pasarela):
 *   TC1001 viewUnlinked → MG-211 · TC1004 cancelUnlink → MG-214 · TC1005 unlink → MG-215 ·
 *   TC1006 exclusivity → MG-216 · TC1007 reloadPersistence → MG-217.
 * Los casos de precondición "Stripe vinculada" skipean limpio si Stripe no es la pasarela
 * activa (Stripe se vincula vía OAuth Connect, sin modal de credenciales — no hay link
 * programático; TODO F5 `ensureActiveGateway('stripe')`).
 *
 * Los 3 casos restantes requieren el LINK OAuth de Stripe (sin implementación UI genérica)
 * y quedan `fixme` ACÁ (no en la factory), con su mapeo del registry documentado:
 *   TC1002 linkValid → MG-212 · TC1003 linkInvalid → MG-213 · TC1008 linkStatus → MG-218.
 *
 * ⚠️ DESTRUCTIVO EN RUNTIME (los casos generados): unlink de la pasarela activa del carrier
 * 1521 dispara cleaningWallets. La factory skipea limpio sin GATEWAY_ALLOW_DESTRUCTIVE_SWITCH.
 */
import { test } from '@TestFixture';
import { defineGatewayConfigSuite } from '@features/gateway-pg/specs/_parametrized/factories/gateway-config.factory';

// Casos genéricos soportados por la factory para Stripe (sin link programático).
defineGatewayConfigSuite('stripe', {
	cases: ['viewUnlinked', 'cancelUnlink', 'unlink', 'exclusivity', 'reloadPersistence']
});

// ── Casos OAuth pendientes (fixme en el CONSUMIDOR, no en la factory) ────────────────────
// Stripe se vincula vía OAuth Connect test-mode (portar el loop de
// agentic-qa-boilerplate/tests/gateway-legacy/link-stripe-gateway.test.ts — TODO F5).
// Sin modal de credenciales no hay driver de link genérico para linkValid/linkInvalid/linkStatus.

test.use({ storageState: undefined });

test.describe('Gateway PG · Carrier · Configuración Pasarela Stripe — casos OAuth pendientes @gateway @stripe @cfg @regression', () => {
	test(
		'[TS-STRIPE-TC1002] @smoke @critical @cfg Validar vincular Stripe con credenciales válidas',
		{ annotation: [{ type: 'tms', description: 'MG-212' }] },
		async () => {
			test.fixme(
				true,
				'PENDIENTE: link Stripe = OAuth Connect (sin modal de credenciales) — sin driver genérico en la factory CFG (TODO F5).'
			);
		}
	);
	test(
		'[TS-STRIPE-TC1003] @regression @cfg Validar impedir vincular Stripe con credenciales inválidas',
		{ annotation: [{ type: 'tms', description: 'MG-213' }] },
		async () => {
			test.fixme(
				true,
				'PENDIENTE: rechazo de link Stripe ocurre dentro del flujo OAuth Connect — sin driver genérico en la factory CFG (TODO F5).'
			);
		}
	);
	test(
		'[TS-STRIPE-TC1008] @regression @cfg Validar la request de link de Stripe retorna un status de éxito conocido',
		{ annotation: [{ type: 'tms', description: 'MG-218' }] },
		async () => {
			test.fixme(
				true,
				'PENDIENTE: la mutación de link Stripe viaja por el redirect OAuth (no por el modal) — sin driver genérico en la factory CFG (TODO F5).'
			);
		}
	);
});
