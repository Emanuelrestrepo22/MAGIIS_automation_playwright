/**
 * TCs: TS-STRIPE-TC1065–TC1076
 * Feature: Alta de Viaje desde Carrier — Usuario Empresa Individuo — sin 3DS
 * Tags: @regression @hold @web-only
 *
 * Sin 3DS set 1: TC1065–TC1068 · Sin 3DS set 2: TC1073–TC1076
 *
 * Precondición: Marcelle Stripe debe tener al menos una tarjeta 4242 vinculada. Se valida
 * vía API (paymentMethodsByPax) dentro del Step; si existe se usa la guardada (cardFlow
 * 'existing'), si no se vincula nueva (cardFlow 'new').
 *
 * KATA conformance (feature/kata-conformance): amoldado al patrón de apppax-hold-3ds.
 *   - test/expect del fixture KATA (@TestFixture); orquestación compartida en
 *     `CarrierHoldSteps.runHoldScenario` (@steps); Page components @ui/carrier.
 *   - TC1065 pasó de cuerpo inline (con diagnóstico de dashboard no-asertivo) a runHoldScenario;
 *     la aserción de hold (viaje en "Por Asignar") se preserva idéntica.
 * ATCs mapeados en las Page components: fillMinimum → MG-148 (área C),
 *   expectPassengerInPorAsignar → MG-158 (área E). mapeo por área aceptado (idmap API-level,
 *   sin 1:1 con TS-STRIPE-TC10xx).
 */
import { test } from '@TestFixture';
import { CarrierHoldSteps, type CardFlow, type HoldScenario } from '@steps/index';
import { TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { PASSENGERS } from '@features/gateway-pg/data/passengers';

function empresaScenario(cardFlow: CardFlow, overrides: Partial<HoldScenario> = {}): HoldScenario {
	return {
		client: PASSENGERS.empresaIndividuo.name,
		passenger: PASSENGERS.empresaIndividuo.name,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		apiSearchQuery: PASSENGERS.empresaIndividuo.apiSearchQuery,
		cardFlow,
		...overrides,
	};
}

// El fixture KATA no define la opción `role` (login explícito vía loginAsDispatcher(page)).
test.use({ storageState: undefined });
test.describe.configure({ timeout: 180_000 });

test.describe('Gateway PG · Carrier · Empresa Individuo — Hold sin 3DS @gateway @stripe @hold @critical @smoke @regression', () => {

	test.describe('Hold ON', () => {
		// TC1065 — canónico card-new (smoke). Ver par card-existing en TC1067.
		test('[TS-STRIPE-TC1065] @smoke @hold @card-new hold+cobro empresa sin 3DS — Vincular tarjeta nueva', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(empresaScenario('new'), { hold: 'on', threeDs: false });
		});

		// Par card-existing de TC1065 — canonical_ref TS-STRIPE-TC1065 en normalized-test-cases.json
		test('[TS-STRIPE-TC1067] @regression @hold @card-existing hold+cobro empresa sin 3DS — Usar tarjeta vinculada existente', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(empresaScenario('existing'), { hold: 'on', threeDs: false });
		});

		// DEPRECATED: ver TC canónico TS-STRIPE-TC1065 (fase 2 — duplicado sin card-flow diferenciado)
		test('[TS-STRIPE-TC1073] @regression @hold hold+cobro empresa sin 3DS (set 2)', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(empresaScenario('new'), { hold: 'on', threeDs: false });
		});

		// DEPRECATED: ver TC canónico TS-STRIPE-TC1065 (fase 2 — duplicado sin card-flow diferenciado)
		test('[TS-STRIPE-TC1075] @regression @hold hold+cobro empresa sin 3DS variante set 2', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(empresaScenario('new'), { hold: 'on', threeDs: false });
		});
	});

	test.describe('Hold OFF', () => {
		test('[TS-STRIPE-TC1066] @regression @hold @card-new sin hold empresa sin 3DS — Vincular tarjeta nueva', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(empresaScenario('new'), { hold: 'off', threeDs: false });
		});

		// Par card-existing de TC1066 — canonical_ref TS-STRIPE-TC1066 en normalized-test-cases.json
		test('[TS-STRIPE-TC1068] @regression @hold @card-existing sin hold empresa sin 3DS — Usar tarjeta vinculada existente', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(empresaScenario('existing'), { hold: 'off', threeDs: false });
		});

		// DEPRECATED: ver TC canónico TS-STRIPE-TC1066 (fase 2 — duplicado sin card-flow diferenciado)
		test('[TS-STRIPE-TC1074] @regression @hold sin hold empresa sin 3DS (set 2)', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(empresaScenario('new'), { hold: 'off', threeDs: false });
		});

		// DEPRECATED: ver TC canónico TS-STRIPE-TC1066 (fase 2 — duplicado sin card-flow diferenciado)
		test('[TS-STRIPE-TC1076] @regression @hold sin hold empresa sin 3DS variante set 2', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(empresaScenario('new'), { hold: 'off', threeDs: false });
		});
	});

});
