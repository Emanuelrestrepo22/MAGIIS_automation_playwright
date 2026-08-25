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
import {
	assertGatewayTagContract,
	gatewayTag,
	EXPECTED_GATEWAY_TAGS
} from '@features/gateway-pg/helpers/adapters/gateway-tag';
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
import {
	outcomeFor,
	hasObservedOutcome,
	observedIntents,
	liveVerifiedIntents
} from '@features/gateway-pg/helpers/card-outcome-oracle';

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
			expect(
				SUPPORTED_INTENTS_BY_GATEWAY[gateway as GatewayName],
				`intents soportados de ${gateway}`
			).toHaveLength(esperado);
		}

		// 3DS sigue siendo exclusivo de Stripe.
		expect(SUPPORTED_INTENTS_BY_GATEWAY.stripe).toContain('HAPPY_AUTH');
		for (const gateway of ['authorize', 'ebizcharge', 'mercado-pago'] as GatewayName[]) {
			expect(SUPPORTED_INTENTS_BY_GATEWAY[gateway], `${gateway} no debe soportar 3DS`).not.toContain(
				'HAPPY_AUTH'
			);
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
		expect(() => resolveCard({ gateway: 'ebizcharge', intent: 'HAPPY_AUTH' })).toThrow(
			/no soportado por gateway 'ebizcharge'/
		);
	});

	test('@unit el vocabulario de intents cubre los 4 gateways sin huecos declarativos', () => {
		// 25 desde el merge de la suite HOLD (2026-07-29): el vocabulario incorpora
		// DECLINE_ZIP_MISMATCH (intent de DATO, hoy sólo disparable en Authorize).
		expect(ALL_CARD_INTENTS).toHaveLength(25);

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
		expect(SUPPORTED_INTENTS_BY_GATEWAY.ebizcharge.length).toBeGreaterThan(
			SUPPORTED_INTENTS_BY_GATEWAY.stripe.length
		);
	});

	test('@unit el oráculo de sistema distingue lo verificado en vivo de lo documentado', () => {
		// Aprobada → sale a buscar chofer y la tarjeta queda validada.
		expect(outcomeFor('HAPPY_NO_AUTH').expectedTravelStatus).toBe('Buscando chofer');
		expect(outcomeFor('HAPPY_NO_AUTH').addCardShouldSucceed).toBe(true);
		expect(outcomeFor('HAPPY_NO_AUTH').basis).toBe('live-verified');

		// Rechazada → no autorizado y la tarjeta NO se valida.
		expect(outcomeFor('DECLINE_INSUFFICIENT_FUNDS').expectedTravelStatus).toBe('No autorizado');
		expect(outcomeFor('DECLINE_INSUFFICIENT_FUNDS').addCardShouldSucceed).toBe(false);
		expect(outcomeFor('DECLINE_INSUFFICIENT_FUNDS').basis).toBe('documented-class');

		// Verificación blanda: APRUEBA aunque la verificación falle — el riesgo es el
		// opuesto al de un decline, así que su estado esperado es el del happy path.
		expect(outcomeFor('APPROVED_AVS_MISMATCH').expectedTravelStatus).toBe('Buscando chofer');
		expect(outcomeFor('APPROVED_CVV_MISMATCH').addCardShouldSucceed).toBe(true);

		// Todo oráculo declara evidencia, y ninguno inventa el copy del mensaje.
		for (const intent of observedIntents()) {
			const outcome = outcomeFor(intent);
			expect(outcome.evidence.length, `${intent} sin evidencia`).toBeGreaterThan(20);
			if (outcome.basis === 'documented-class') {
				expect(
					outcome.messagePattern,
					`${intent}: el copy no está verificado, no se puede assertar texto`
				).toBeUndefined();
			}
		}

		// Los 3 intents cuyo comportamiento NO se deduce siguen lanzando en vez de
		// resolverse con un default optimista.
		for (const intent of ['FRAUD_REVIEW', 'HAPPY_PARTIAL_AUTH', 'DECLINE_CAPTURE'] as const) {
			expect(hasObservedOutcome(intent), `${intent} no debería tener oráculo todavía`).toBe(false);
			expect(() => outcomeFor(intent)).toThrow(/no tiene comportamiento esperado declarado/);
		}

		// 24 intents - 3 sin definir = 21 con oráculo.
		expect(observedIntents()).toHaveLength(21);
		expect(liveVerifiedIntents().length).toBeGreaterThanOrEqual(4);
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
