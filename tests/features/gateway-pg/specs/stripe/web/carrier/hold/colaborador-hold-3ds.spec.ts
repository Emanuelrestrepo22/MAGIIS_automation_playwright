/**
 * TCs: TS-STRIPE-TC1037–TC1040, TC1045–TC1048
 * Feature: Alta de Viaje desde Carrier — Usuario Colaborador/Asociado Contractor — con 3DS
 * Tags: @critical @3ds @hold @web-only
 *
 * KATA conformance (feature/kata-conformance): amoldado al patrón de apppax-hold-3ds.
 *   - test/expect del fixture KATA (@TestFixture); orquestación compartida en
 *     `CarrierHoldSteps.runHoldScenario` (@steps); Page components @ui/carrier.
 *   - el modal 3DS usa el componente KATA `ThreeDsChallengePage extends UiBase` (@ui).
 * ATCs mapeados en las Page components: fillMinimum → MG-148 (área C),
 *   expectPassengerInPorAsignar → MG-158 (área E), challenge 3DS → MG-152/153 (área D).
 *   PENDIENTE REASIGNAR (idmap API-level, sin 1:1 con TS-STRIPE-TC10xx).
 */
import { test } from '@TestFixture';
import { CarrierHoldSteps, type CardFlow, type HoldScenario } from '@steps/index';
import { TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { PASSENGERS } from '@features/gateway-pg/data/passengers';

function colaboradorScenario(cardFlow: CardFlow, overrides: Partial<HoldScenario> = {}): HoldScenario {
	return {
		client: TEST_DATA.contractorClient,
		passenger: TEST_DATA.contractorPassenger,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
		cardFlow,
		...overrides,
	};
}

// El fixture KATA no define la opción `role` (login explícito vía loginAsDispatcher(page)).
test.use({ storageState: undefined });
test.describe.configure({ timeout: 180_000 });

test.describe('Gateway PG · Carrier · Colaborador — Hold con 3DS @gateway @stripe @hold @3ds @critical @regression', () => {

	test.describe('Hold ON', () => {
		test('[TS-STRIPE-TC1037] @critical @3ds @hold @card-new hold+cobro colaborador 3DS — Vincular tarjeta nueva', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(colaboradorScenario('new'), { hold: 'on', threeDs: true });
		});
		// TC1039 en el JSON es un escenario negativo (fallo 3DS); acá se mantiene la cobertura
		// histórica con alwaysAuthenticate (default del flujo 3DS). No tiene par -CARD-EXISTING.
		test('[TS-STRIPE-TC1039] @regression @3ds @hold hold+cobro colaborador 3DS variante', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(colaboradorScenario('new'), { hold: 'on', threeDs: true });
		});
		// Par card-existing de TC1037 — canonical_ref TS-STRIPE-TC1037 en normalized-test-cases.json
		test('[TS-STRIPE-TC1045] @regression @3ds @hold @card-existing hold+cobro colaborador 3DS — Usar tarjeta vinculada existente', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(colaboradorScenario('existing'), { hold: 'on', threeDs: true });
		});
		// DEPRECATED: ver TC canónico TS-STRIPE-TC1037 (fase 2 — duplicado sin card-flow diferenciado)
		test('[TS-STRIPE-TC1047] @regression @3ds @hold hold+cobro colaborador 3DS variante 2', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(colaboradorScenario('new'), { hold: 'on', threeDs: true });
		});
	});

	test.describe('Hold OFF', () => {
		test('[TS-STRIPE-TC1038] @regression @3ds @card-new sin hold colaborador 3DS — Vincular tarjeta nueva', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(colaboradorScenario('new'), { hold: 'off', threeDs: true });
		});
		// Par card-existing de TC1038 — canonical_ref TS-STRIPE-TC1038 en normalized-test-cases.json
		test('[TS-STRIPE-TC1040] @regression @3ds @card-existing sin hold colaborador 3DS — Usar tarjeta vinculada existente', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(colaboradorScenario('existing'), { hold: 'off', threeDs: true });
		});
		// DEPRECATED: ver TC canónico TS-STRIPE-TC1038 (fase 2 — duplicado sin card-flow diferenciado)
		test('[TS-STRIPE-TC1046] @regression @3ds sin hold colaborador 3DS (set 2)', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(colaboradorScenario('new'), { hold: 'off', threeDs: true });
		});
		// DEPRECATED: ver TC canónico TS-STRIPE-TC1038 (fase 2 — duplicado sin card-flow diferenciado)
		test('[TS-STRIPE-TC1048] @regression @3ds sin hold colaborador 3DS variante 2', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(colaboradorScenario('new'), { hold: 'off', threeDs: true });
		});
	});

});
