/**
 * TCs: TS-STRIPE-P2-TC005, TS-STRIPE-P2-TC006
 * Feature: Portal Contractor — Alta de Viaje — Colaborador — Hold + 3DS (tarjeta 4000 0025 0000 3155)
 * Tags: @regression @contractor @hold @3ds
 *
 * KATA conformance (feature/kata-conformance): amoldado al fixture unificado.
 *   - test del fixture KATA (@TestFixture) en vez de TestBase.
 *   - orquestación compartida extraída al Step `ContractorHoldSteps.runColaboradorScenario` (@steps).
 *   - Page components KATA (@ui/contractor + @ui/carrier + @ui/ThreeDsChallengePage).
 * ATCs mapeados en las Page components: fillMinimum → MG-148 (área C), 3DS → MG-152
 *   (área D). mapeo por área aceptado (idmap API-level, sin 1:1 con TS-STRIPE-P2-TC00x).
 *
 * Precondiciones:
 * - Usuario contractor activo (USER_CONTRACTOR / PASS_CONTRACTOR) en TEST.
 * - Colaborador configurado en TEST_DATA.contractorColaborador.
 * - TC005 (Hold ON + 3DS): enableCreditCardHold=true en parámetros del carrier.
 * - TC006 (Hold OFF + 3DS): enableCreditCardHold=false en parámetros del carrier.
 *   ⚠ El estado de hold se controla desde el portal carrier (Preferencias Operativas).
 *
 * TC005: Hold ON  — tarjeta 4000 0025 0000 3155 + 3DS aprobado (challenge de vinculación
 *   obligatorio + challenge de servicio opcional) → viaje a "Buscando conductor".
 * TC006: Hold OFF — tarjeta 4000 0025 0000 3155 + 3DS aprobado (hasta 2 challenges
 *   opcionales post-envío) → viaje a "Buscando conductor" sin hold.
 */
import { test } from '@TestFixture';
import { ContractorHoldSteps, type ContractorHoldScenario } from '@steps/index';
import { TEST_DATA, STRIPE_TEST_CARDS } from '@features/gateway-pg/fixtures/gateway.fixtures';

function colaborador3dsScenario(overrides: Partial<ContractorHoldScenario> = {}): ContractorHoldScenario {
	return {
		user: TEST_DATA.contractorColaborador,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		card: { kind: 'new', last4: STRIPE_TEST_CARDS.alwaysAuthenticate.slice(-4) }, // 3155
		threeDs: 'link-then-service',
		...overrides,
	};
}

// El fixture KATA no define la opción `role` (login explícito vía loginAsContractor(page)).
test.use({ storageState: undefined });
test.describe.configure({ timeout: 180_000 });

test.describe('Gateway PG · Contractor · Colaborador — Hold + 3DS (tarjeta 4000 0025 0000 3155) @gateway @stripe @hold @3ds @critical @regression', () => {

	test('[TS-STRIPE-P2-TC005] @regression @contractor @hold @3ds Hold ON + tarjeta 3DS 3155 + aprobación → viaje a "Buscando conductor"', async ({ page }) => {
		// Precondición: enableCreditCardHold=true en parámetros carrier.
		await new ContractorHoldSteps({ page }).runColaboradorScenario(colaborador3dsScenario());
	});

	test('[TS-STRIPE-P2-TC006] @regression @contractor @3ds Hold OFF + tarjeta 3DS 3155 + aprobación → viaje a "Buscando conductor" sin hold', async ({ page }) => {
		// Precondición: enableCreditCardHold=false en parámetros carrier.
		// Con Hold OFF la tarjeta 3DS puede disparar hasta 2 challenges opcionales post-envío.
		await new ContractorHoldSteps({ page }).runColaboradorScenario(colaborador3dsScenario({ threeDs: 'post-service-double' }));
	});

});
