/**
 * TCs: TS-STRIPE-TC1033–TC1044
 * Feature: Alta de Viaje desde Carrier — Usuario Colaborador/Asociado Contractor — sin 3DS
 * Tags: @regression @hold @web-only
 *
 * Sin 3DS set 1: TC1033–TC1036 · Sin 3DS set 2: TC1041–TC1044
 *
 * KATA conformance (feature/kata-conformance): amoldado al patrón de apppax-hold-3ds.
 *   - test/expect del fixture KATA (@TestFixture); orquestación compartida en
 *     `CarrierHoldSteps.runHoldScenario` (@steps); Page components @ui/carrier.
 * ATCs mapeados en las Page components: fillMinimum → MG-148 (área C),
 *   expectPassengerInPorAsignar → MG-158 (área E). PENDIENTE REASIGNAR (idmap API-level,
 *   sin 1:1 con TS-STRIPE-TC10xx).
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

const CUSTOM_ADDRESS = { origin: 'Av. Corrientes 1234, Buenos Aires', destination: 'Av. Santa Fe 2100, Buenos Aires' };

// El fixture KATA no define la opción `role` (login explícito vía loginAsDispatcher(page)).
test.use({ storageState: undefined });
test.describe.configure({ timeout: 180_000 });

test.describe('Gateway PG · Carrier · Colaborador — Hold sin 3DS @gateway @stripe @hold @critical @smoke @regression', () => {

	test.describe('Hold ON', () => {
		// TC1033 es el smoke legacy pre-fase2; no tiene par -CARD-EXISTING en JSON.
		test('[TS-STRIPE-TC1033] @smoke @hold hold+cobro colaborador sin 3DS', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(colaboradorScenario('new'), { hold: 'on', threeDs: false });
		});

		test('[TS-STRIPE-TC1035] @regression @hold @card-new hold+cobro colaborador sin 3DS — Vincular tarjeta nueva', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(colaboradorScenario('new', CUSTOM_ADDRESS), { hold: 'on', threeDs: false });
		});

		// Par card-existing de TC1035 — canonical_ref TS-STRIPE-TC1035 en normalized-test-cases.json
		test('[TS-STRIPE-TC1041] @regression @hold @card-existing hold+cobro colaborador sin 3DS — Usar tarjeta vinculada existente', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(colaboradorScenario('existing', CUSTOM_ADDRESS), { hold: 'on', threeDs: false });
		});

		// DEPRECATED: ver TC canónico TS-STRIPE-TC1035 (fase 2 — duplicado sin card-flow diferenciado)
		test('[TS-STRIPE-TC1043] @regression @hold hold+cobro colaborador sin 3DS variante set 2', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(colaboradorScenario('new'), { hold: 'on', threeDs: false });
		});
	});

	test.describe('Hold OFF', () => {
		test('[TS-STRIPE-TC1034] @regression @hold @card-new sin hold colaborador sin 3DS — Vincular tarjeta nueva', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(colaboradorScenario('new'), { hold: 'off', threeDs: false });
		});

		// Par card-existing de TC1034 — canonical_ref TS-STRIPE-TC1034 en normalized-test-cases.json
		test('[TS-STRIPE-TC1036] @regression @hold @card-existing sin hold colaborador sin 3DS — Usar tarjeta vinculada existente', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(colaboradorScenario('existing'), { hold: 'off', threeDs: false });
		});

		// DEPRECATED: ver TC canónico TS-STRIPE-TC1034 (fase 2 — duplicado sin card-flow diferenciado)
		test('[TS-STRIPE-TC1042] @regression @hold sin hold colaborador sin 3DS (set 2)', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(colaboradorScenario('new'), { hold: 'off', threeDs: false });
		});

		// DEPRECATED: ver TC canónico TS-STRIPE-TC1034 (fase 2 — duplicado sin card-flow diferenciado)
		test('[TS-STRIPE-TC1044] @regression @hold sin hold colaborador sin 3DS variante set 2', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(colaboradorScenario('new'), { hold: 'off', threeDs: false });
		});
	});

});
