/**
 * TCs: TS-STRIPE-P2-TC001, TC002, TC003, TC004
 * Feature: Portal Contractor — Alta de Viaje — Colaborador — Hold sin 3DS (tarjeta 4242 4242 4242 4242)
 * Tags: @smoke @regression @contractor @hold
 *
 * KATA conformance (feature/kata-conformance): amoldado al fixture unificado.
 *   - test del fixture KATA (@TestFixture) en vez de TestBase.
 *   - orquestación compartida extraída al Step `ContractorHoldSteps.runColaboradorScenario` (@steps).
 *   - Page components KATA (@ui/contractor + @ui/carrier) en vez de los POMs del sustrato.
 * ATCs mapeados en las Page components: fillMinimum → MG-148 (área C),
 *   selectSavedCard → MG-482 (área C UI). PENDIENTE REASIGNAR (idmap API-level,
 *   sin 1:1 con TS-STRIPE-P2-TC00x).
 *
 * Precondiciones:
 * - Usuario contractor activo (USER_CONTRACTOR / PASS_CONTRACTOR) en TEST.
 * - Colaborador configurado en TEST_DATA.contractorColaborador.
 * - Hold ON tests (TC001, TC003): preferencias operativas del carrier con enableCreditCardHold=true.
 * - Hold OFF tests (TC002, TC004): preferencias operativas del carrier con enableCreditCardHold=false.
 *   ⚠ El estado de hold se controla desde el portal carrier — es precondición externa.
 *
 * TC001: Hold ON  — nueva vinculación tarjeta 4242 + alta → viaje a "Buscando conductor"
 * TC002: Hold OFF — nueva vinculación tarjeta 4242 + alta → viaje a "Buscando conductor" sin hold
 * TC003: Hold ON  — selección tarjeta existente + alta → viaje a "Buscando conductor"
 * TC004: Hold OFF — selección tarjeta existente + alta → viaje a "Buscando conductor" sin hold.
 */
import { test } from '@TestFixture';
import { ContractorHoldSteps, type ContractorHoldScenario } from '@steps/index';
import { TEST_DATA, STRIPE_TEST_CARDS } from '@features/gateway-pg/fixtures/gateway.fixtures';

function colaboradorScenario(overrides: Partial<ContractorHoldScenario> = {}): ContractorHoldScenario {
	return {
		user: TEST_DATA.contractorColaborador,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		card: { kind: 'new', last4: STRIPE_TEST_CARDS.successDirect.slice(-4) }, // 4242
		threeDs: 'none',
		...overrides,
	};
}

// El fixture KATA no define la opción `role` (login explícito vía loginAsContractor(page)).
test.use({ storageState: undefined });
test.describe.configure({ timeout: 180_000 });

test.describe('Gateway PG · Contractor · Colaborador — Hold sin 3DS (tarjeta 4242 4242 4242 4242) @gateway @stripe @hold @critical @smoke @regression', () => {

	test.describe('Hold ON', () => {
		test('[TS-STRIPE-P2-TC001] @smoke @contractor @hold Hold ON + nueva vinculación tarjeta 4242 + alta colaborador → viaje a "Buscando conductor"', async ({ page }) => {
			await new ContractorHoldSteps({ page }).runColaboradorScenario(colaboradorScenario());
		});

		test('[TS-STRIPE-P2-TC003] @regression @contractor @hold Hold ON + selección tarjeta VISA guardada del colaborador + alta → viaje a "Buscando conductor"', async ({ page }) => {
			await new ContractorHoldSteps({ page }).runColaboradorScenario(colaboradorScenario({ card: { kind: 'saved' } }));
		});
	});

	test.describe('Hold OFF', () => {
		test('[TS-STRIPE-P2-TC002] @regression @contractor @hold Hold OFF + nueva vinculación tarjeta 4242 + alta colaborador → viaje a "Buscando conductor" sin hold', async ({ page }) => {
			await new ContractorHoldSteps({ page }).runColaboradorScenario(colaboradorScenario());
		});

		test('[TS-STRIPE-P2-TC004] @regression @contractor @hold Hold OFF + selección tarjeta VISA guardada del colaborador + alta → viaje a "Buscando conductor" sin hold', async ({ page }) => {
			await new ContractorHoldSteps({ page }).runColaboradorScenario(colaboradorScenario({ card: { kind: 'saved' } }));
		});
	});

});
