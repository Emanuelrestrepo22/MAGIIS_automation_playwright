/**
 * Guard de arquitectura (post-review A1) — consistencia adapter ↔ resolver ↔ registries.
 *
 * Ejecuta `assertAdapterFixtureConsistency()` (helpers/adapters) dentro del project
 * `unit` (testMatch `*.unit.spec.ts` en playwright.gateway-pg.config.ts) para que el
 * drift entre adapters declarativos, resolver de tarjetas, registry Xray y journey
 * defaults falle en CI — antes de este spec el check existía pero no lo invocaba
 * ninguna suite.
 *
 * Incluye además el contrato de tags: `gatewayTag()` es la SoT del tag Playwright por
 * pasarela y DEBE coincidir con lo que grepean los scripts `test:test:gateway:*`. Un
 * tag divergente no falla — simplemente deja la suite fuera del `--grep`, o sea
 * cobertura invisible; por eso se verifica acá.
 *
 * Test PURO (sin browser): importa `test` plano de @playwright/test — no pide el
 * fixture `page`, así el runner no lanza Chromium (a diferencia del piloto
 * stripe-card-declined.unit.spec.ts, que sí mockea red sobre una página real).
 * 100% offline y determinista: solo valida datos estáticos en memoria.
 *
 * Ejecución:
 *   npx playwright test -c playwright.gateway-pg.config.ts --project=unit --grep "consistency"
 */
import { test, expect } from '@playwright/test';
import { assertAdapterFixtureConsistency } from '@features/gateway-pg/helpers/adapters';
import { assertGatewayTagContract, gatewayTag, EXPECTED_GATEWAY_TAGS } from '@features/gateway-pg/helpers/adapters/gateway-tag';
import {
	assertCardMatrixIntegrity,
	intentSupport,
	resolveCard,
	ALL_CARD_INTENTS,
	CARD_MATRIX,
	EXPECTED_SUPPORTED_COUNTS,
	SUPPORTED_INTENTS_BY_GATEWAY,
	type GatewayName
} from '@fixtures/gateways/_shared';
import { outcomeFor, hasObservedOutcome, observedIntents } from '@features/gateway-pg/helpers/journey-outcome';

test.describe('[unit] Adapters — consistencia declarativa cross-gateway @gateway @unit @regression', () => {
	test('@unit assertAdapterFixtureConsistency: adapters ↔ resolver ↔ xray-keys ↔ journey-defaults sin drift', () => {
		// Lanza con detalle [adapter-fixture-drift] si alguna de las 7 invariantes rompe;
		// devuelve `true` si todo consistente (firma: `(): true`).
		expect(assertAdapterFixtureConsistency()).toBe(true);
	});

	test('@unit assertGatewayTagContract: gatewayTag() ↔ tag que grepean los scripts npm', () => {
		expect(assertGatewayTagContract()).toBe(true);
		// Pin explícito del caso con guion — el único donde el tag ≠ el nombre.
		expect(gatewayTag('mercado-pago')).toBe('@mercadopago');
		expect(Object.keys(EXPECTED_GATEWAY_TAGS)).toHaveLength(4);
	});

	test('@unit assertCardMatrixIntegrity: toda celda declarada y conteos de soporte pinneados', () => {
		expect(assertCardMatrixIntegrity()).toBe(true);

		// Los conteos derivados DEBEN coincidir con el pin. Si esto falla con "todos los
		// intents soportados" en las 4 pasarelas, falta el .filter(isSupported) al derivar.
		for (const [gateway, esperado] of Object.entries(EXPECTED_SUPPORTED_COUNTS)) {
			expect(SUPPORTED_INTENTS_BY_GATEWAY[gateway as GatewayName], `intents soportados de ${gateway}`).toHaveLength(esperado);
		}

		// 3DS sigue siendo exclusivo de Stripe.
		expect(SUPPORTED_INTENTS_BY_GATEWAY.stripe).toContain('HAPPY_AUTH');
		for (const gateway of ['authorize', 'ebizcharge', 'mercado-pago'] as GatewayName[]) {
			expect(SUPPORTED_INTENTS_BY_GATEWAY[gateway], `${gateway} no debe soportar 3DS`).not.toContain('HAPPY_AUTH');
		}
	});

	test('@unit intentSupport: no lanza y devuelve la razón declarada en la celda N/A', () => {
		const soportado = intentSupport('ebizcharge', 'HAPPY_NO_AUTH');
		expect(soportado.supported).toBe(true);
		if (soportado.supported) {
			expect(soportado.card.gateway).toBe('ebizcharge');
			expect(soportado.card.number).toBe('4000100011112224');
			expect(soportado.card.requires3ds).toBe(false);
			// MMYY del fixture eBiz normalizado a MM/YY del shape común.
			expect(soportado.card.expiry).toBe('09/30');
		}

		const naCase = intentSupport('ebizcharge', 'HAPPY_AUTH');
		expect(naCase.supported).toBe(false);
		if (!naCase.supported) {
			// La razón viaja literal desde la celda — es lo que verá el skip en el reporte.
			expect(naCase.reason).toContain('3DS');
			expect(naCase.reason.length).toBeGreaterThan(20);
		}

		// resolveCard mantiene el contrato histórico: lanza para un intent no soportado.
		expect(() => resolveCard({ gateway: 'ebizcharge', intent: 'HAPPY_AUTH' })).toThrow(/no soportado por gateway 'ebizcharge'/);
	});

	test('@unit el vocabulario de intents cubre los 4 gateways sin huecos declarativos', () => {
		expect(ALL_CARD_INTENTS).toHaveLength(24);

		// Cada intent tiene celda declarada en las 4 pasarelas — soportada o N/A con razón.
		// Esto es lo que hace imposible el hueco silencioso: no hay "intent sin declarar".
		for (const gateway of Object.keys(CARD_MATRIX) as GatewayName[]) {
			for (const intent of ALL_CARD_INTENTS) {
				const support = intentSupport(gateway, intent);
				if (!support.supported) {
					expect(support.reason, `${gateway}.${intent} sin razón de N/A`).toBeTruthy();
				}
			}
		}

		// eBizCharge es la pasarela con más outcomes de negocio expresables: su doc publica
		// 14 códigos de decline + antifraude + referral + latencia.
		expect(SUPPORTED_INTENTS_BY_GATEWAY.ebizcharge.length).toBeGreaterThan(SUPPORTED_INTENTS_BY_GATEWAY.stripe.length);
	});

	test('@unit outcomeFor lanza para un intent sin comportamiento observado', () => {
		// Los dos observados y documentados.
		expect(outcomeFor('HAPPY_NO_AUTH').expectedTravelStatus).toBe('Buscando chofer');
		expect(outcomeFor('DECLINE_AUTHORIZE').expectedTravelStatus).toBe('No autorizado');
		expect(outcomeFor('HAPPY_NO_AUTH').evidence.length).toBeGreaterThan(20);

		// El resto NO tiene oráculo todavía, y eso tiene que doler explícitamente en vez de
		// resolverse con un default optimista.
		expect(() => outcomeFor('FRAUD_REVIEW')).toThrow(/no tiene comportamiento OBSERVADO/);
		expect(hasObservedOutcome('FRAUD_REVIEW')).toBe(false);
		expect(observedIntents()).toEqual(['HAPPY_NO_AUTH', 'DECLINE_AUTHORIZE']);
	});

	test('@unit requires3ds sale de la celda, no del nombre del intent', () => {
		// Las dos celdas Stripe con challenge lo declaran explícitamente.
		expect(resolveCard({ gateway: 'stripe', intent: 'HAPPY_AUTH' }).requires3ds).toBe(true);
		expect(resolveCard({ gateway: 'stripe', intent: 'FAIL_AUTH' }).requires3ds).toBe(true);
		// El resto de Stripe no.
		expect(resolveCard({ gateway: 'stripe', intent: 'HAPPY_NO_AUTH' }).requires3ds).toBe(false);
		expect(resolveCard({ gateway: 'stripe', intent: 'DECLINE_CAPTURE' }).requires3ds).toBe(false);
	});
});
