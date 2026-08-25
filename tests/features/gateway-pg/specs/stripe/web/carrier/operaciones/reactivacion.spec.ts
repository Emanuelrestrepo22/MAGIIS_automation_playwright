/**
 * TCs: TS-STRIPE-P2-TC060–TC065
 * Feature: Reactivación de Viajes Cancelados — Carrier
 * Tags: @regression @web-only
 *
 * TC060 (ancla verde, MG-178 FASE 2) conserva su flujo original (`runReactivateCancelledPreauth`,
 * sin cambios). Las variantes TC061..065 — antes DEUDA TÉCNICA — quedan destrabadas con
 * precondición SELF-CONTAINED: `CarrierReactivationSteps.runReactivationScenario` compone
 * `CarrierHoldSteps.runHoldScenario` para el seed (hold ON/OFF × 3DS × card-flow según la fila
 * de la matriz; su cleanup interno CANCELA el viaje → precondición lista) y reutiliza el mismo
 * tramo de reactivación + oráculo del ancla (URL de despacho driver/list/Assign).
 *
 * Datos: app pax (conocido-estable, mismo dataset que apppax-hold-no3ds). La variante
 * "Empresa Individuo" original tiene data-init defectuosa (MG-178 gap #5) → se mantiene el
 * dataset del ancla para todas las variantes.
 * KATA conformance: test del fixture KATA (@TestFixture); orquestación en `CarrierReactivationSteps`
 * (@steps); acción de reactivación mapeada a MG-440 en `CarrierTravelManagementPage` (pendiente reasignar).
 *
 * FRAGILE / TODO(live) — TC064/065 (3DS): la reactivación re-ejecuta el hold server-side; si el
 * PSP exigiera re-autenticación 3DS off-session, el viaje reactivado caería en NO_AUTORIZADO y
 * el oráculo de URL lo reportaría (ver JSDoc de runReactivationScenario).
 */
import { test } from '@TestFixture';
import { CarrierReactivationSteps, type ReactivationVariantScenario } from '@steps/index';
import { TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { PASSENGERS } from '@features/gateway-pg/data/passengers';

function appPaxScenario(): ReactivationVariantScenario {
	return {
		client: TEST_DATA.appPaxPassenger,
		passenger: TEST_DATA.appPaxPassenger,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		apiSearchQuery: PASSENGERS.appPax.apiSearchQuery
	};
}

// El fixture KATA no define `role` (login explícito vía loginAsDispatcher en el Step).
test.use({ storageState: undefined });
test.describe.configure({ timeout: 180_000 });

test.describe('Gateway PG · Carrier — Reactivación de Viajes Cancelados @gateway @stripe @hold @regression', () => {
	test.describe('Sin 3DS', () => {
		test('[TS-STRIPE-P2-TC060] @regression @hold reactivación cancelado hold+cobro', async ({ page }) => {
			test.setTimeout(240_000); // flujo real (alta + hold + cancelación + reactivación) es lento en TEST
			await new CarrierReactivationSteps({ page }).runReactivateCancelledPreauth({
				client: TEST_DATA.appPaxPassenger,
				passenger: TEST_DATA.appPaxPassenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination
			});
		});

		test('[TS-STRIPE-P2-TC061] @regression @card-new sin hold reactivación cancelado — Vincular tarjeta nueva', async ({
			page
		}) => {
			test.setTimeout(300_000); // seed (alta + verificación + cancelación) + reactivación + restore hold
			await new CarrierReactivationSteps({ page }).runReactivationScenario(appPaxScenario(), {
				hold: 'off',
				threeDs: false,
				cardFlow: 'new'
			});
		});

		test('[TS-STRIPE-P2-TC062] @regression @hold @card-existing reactivación cancelado hold+cobro — Usar tarjeta vinculada existente', async ({
			page
		}) => {
			test.setTimeout(300_000);
			// cardFlow 'existing' exige la 4242 ya vinculada (test.skip con motivo si falta — resolveCardFlow).
			await new CarrierReactivationSteps({ page }).runReactivationScenario(appPaxScenario(), {
				hold: 'on',
				threeDs: false,
				cardFlow: 'existing'
			});
		});

		test('[TS-STRIPE-P2-TC063] @regression @card-existing sin hold reactivación cancelado — Usar tarjeta vinculada existente', async ({
			page
		}) => {
			test.setTimeout(300_000);
			await new CarrierReactivationSteps({ page }).runReactivationScenario(appPaxScenario(), {
				hold: 'off',
				threeDs: false,
				cardFlow: 'existing'
			});
		});
	});

	test.describe('Con 3DS', () => {
		test('[TS-STRIPE-P2-TC064] @regression @3ds @hold reactivación cancelado hold+cobro 3DS', async ({ page }) => {
			test.setTimeout(300_000);
			await new CarrierReactivationSteps({ page }).runReactivationScenario(appPaxScenario(), {
				hold: 'on',
				threeDs: true,
				cardFlow: 'new'
			});
		});

		test('[TS-STRIPE-P2-TC065] @regression @3ds sin hold reactivación cancelado 3DS', async ({ page }) => {
			test.setTimeout(300_000);
			await new CarrierReactivationSteps({ page }).runReactivationScenario(appPaxScenario(), {
				hold: 'off',
				threeDs: true,
				cardFlow: 'new'
			});
		});
	});
});
