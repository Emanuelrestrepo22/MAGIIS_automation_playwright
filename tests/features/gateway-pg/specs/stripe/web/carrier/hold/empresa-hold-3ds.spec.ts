/**
 * TCs: TS-STRIPE-TC1069–TC1072, TC1077–TC1080
 * Feature: Alta de Viaje desde Carrier — Usuario Empresa Individuo — con 3DS
 * Tags: @critical @3ds @hold @web-only
 *
 * KATA conformance (feature/kata-conformance): amoldado al patrón de apppax-hold-3ds.
 *   - test/expect del fixture KATA (@TestFixture); orquestación compartida en
 *     `CarrierHoldSteps.runHoldScenario` (@steps); Page components @ui/carrier.
 *   - el modal 3DS usa el componente KATA `ThreeDsChallengePage extends UiBase` (@ui).
 * ATCs mapeados en las Page components: fillMinimum → MG-148 (área C),
 *   expectPassengerInPorAsignar → MG-158 (área E), challenge 3DS → MG-152/153 (área D).
 *   mapeo por área aceptado (idmap API-level, sin 1:1 con TS-STRIPE-TC10xx).
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
		...overrides
	};
}

// El fixture KATA no define la opción `role` (login explícito vía loginAsDispatcher(page)).
test.use({ storageState: undefined });
test.describe.configure({ timeout: 180_000 });

test.describe(
	'Gateway PG · Carrier · Empresa Individuo — Hold con 3DS @gateway @stripe @hold @3ds @critical @regression',
	{ annotation: [{ type: 'tms', description: 'MG-158' }] },
	() => {
		test.describe('Hold ON', () => {
			test('[TS-STRIPE-TC1069] @critical @3ds @hold @card-new hold+cobro empresa 3DS — Vincular tarjeta nueva', async ({
				page
			}) => {
				await new CarrierHoldSteps({ page }).runHoldScenario(empresaScenario('new'), {
					hold: 'on',
					threeDs: true
				});
			});
			// Par card-existing de TC1069 — canonical_ref TS-STRIPE-TC1069 en normalized-test-cases.json
			test('[TS-STRIPE-TC1071] @regression @3ds @hold @card-existing hold+cobro empresa 3DS — Usar tarjeta vinculada existente', async ({
				page
			}) => {
				await new CarrierHoldSteps({ page }).runHoldScenario(empresaScenario('existing'), {
					hold: 'on',
					threeDs: true
				});
			});
			// DEPRECATED: duplicado de TC1069; se mantiene como referencia pero no se ejecuta.
			test.skip('[TS-STRIPE-TC1077] @regression @3ds @hold hold+cobro empresa 3DS (set 2)', async ({ page }) => {
				await new CarrierHoldSteps({ page }).runHoldScenario(empresaScenario('new'), {
					hold: 'on',
					threeDs: true
				});
			});
			// DEPRECATED: duplicado de TC1069; se mantiene como referencia pero no se ejecuta.
			test.skip('[TS-STRIPE-TC1079] @regression @3ds @hold hold+cobro empresa 3DS variante 2', async ({
				page
			}) => {
				await new CarrierHoldSteps({ page }).runHoldScenario(empresaScenario('new'), {
					hold: 'on',
					threeDs: true
				});
			});
		});

		test.describe('Hold OFF', () => {
			test('[TS-STRIPE-TC1070] @regression @3ds @card-new sin hold empresa 3DS — Vincular tarjeta nueva', async ({
				page
			}) => {
				await new CarrierHoldSteps({ page }).runHoldScenario(empresaScenario('new'), {
					hold: 'off',
					threeDs: true
				});
			});
			// Par card-existing de TC1070 — canonical_ref TS-STRIPE-TC1070 en normalized-test-cases.json
			test('[TS-STRIPE-TC1072] @regression @3ds @card-existing sin hold empresa 3DS — Usar tarjeta vinculada existente', async ({
				page
			}) => {
				await new CarrierHoldSteps({ page }).runHoldScenario(empresaScenario('existing'), {
					hold: 'off',
					threeDs: true
				});
			});
			// DEPRECATED: ver TC canónico TS-STRIPE-TC1070 (fase 2 — duplicado sin card-flow diferenciado)
			test('[TS-STRIPE-TC1078] @regression @3ds sin hold empresa 3DS (set 2)', async ({ page }) => {
				await new CarrierHoldSteps({ page }).runHoldScenario(empresaScenario('new'), {
					hold: 'off',
					threeDs: true
				});
			});
			// DEPRECATED: duplicado de TC1070; se mantiene como referencia pero no se ejecuta.
			test.skip('[TS-STRIPE-TC1080] @regression @3ds sin hold empresa 3DS variante 2', async ({ page }) => {
				await new CarrierHoldSteps({ page }).runHoldScenario(empresaScenario('new'), {
					hold: 'off',
					threeDs: true
				});
			});
		});
	}
);
