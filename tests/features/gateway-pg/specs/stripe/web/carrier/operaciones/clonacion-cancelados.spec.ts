/**
 * TCs: TS-STRIPE-P2-TC066–TC071
 * Feature: Clonación de Viajes Cancelados — Carrier — Empresa Individuo
 * Tags: @regression @web-only
 *
 * PRECONDICIÓN SELF-CONTAINED (destrabado del fixme "requiere viaje cancelado en TEST"):
 * cada test arma su propio viaje fuente vía `CarrierHoldSteps.runHoldScenario` (hold ON/OFF ×
 * 3DS × card-flow según la fila de la matriz) — su cleanup interno CANCELA el viaje al retornar,
 * dejando exactamente la precondición "viaje CANCELADO". Luego `CarrierCloneSteps` clona desde
 * la pestaña Cancelados (botón fa-files-o → alta precargada `?travelId=`) y da de alta el CLON
 * con tarjeta preautorizada, validando el desenlace en "Por Asignar" (mismo oráculo que hold).
 *
 * KATA conformance: test del fixture KATA (@TestFixture); orquestación en `CarrierCloneSteps`
 * (@steps); ATC de clonación en `CarrierTravelManagementPage.cloneTravel` → MG-428 (área CLON
 * del idmap, mapeo por área aceptado).
 *
 * FRAGILE / TODO(live): botón Clonar + form precargado derivados del código FE (gotToClone →
 * travelCreate?travelId=), sin corrida viva aún — ver JSDoc de CarrierCloneSteps.
 */
import { test } from '@TestFixture';
import { CarrierCloneSteps, type CloneRunOptions, type CloneScenario } from '@steps/index';
import { TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { PASSENGERS } from '@features/gateway-pg/data/passengers';

function empresaCloneScenario(): CloneScenario {
	return {
		client: PASSENGERS.empresaIndividuo.name,
		passenger: PASSENGERS.empresaIndividuo.name,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		apiSearchQuery: PASSENGERS.empresaIndividuo.apiSearchQuery
	};
}

function fromCancelados(options: Omit<CloneRunOptions, 'source'>): CloneRunOptions {
	return { source: 'cancelados', ...options };
}

// El fixture KATA no define la opción `role` (login explícito dentro del seed runHoldScenario).
test.use({ storageState: undefined });
// Alta fuente (+ verificación) + cancelación + clonado + alta del clon: flujo largo en TEST.
test.describe.configure({ timeout: 300_000 });

test.describe(
	'Gateway PG · Carrier · Empresa Individuo — Clonación de Viajes Cancelados @gateway @stripe @hold @3ds @regression',
	{ annotation: [{ type: 'tms', description: 'MG-428' }] },
	() => {
		test.describe('Sin 3DS', () => {
			test('[TS-STRIPE-P2-TC066] @regression @hold @card-new clonación cancelado hold+cobro — Vincular tarjeta nueva', async ({
				page
			}) => {
				await new CarrierCloneSteps({ page }).runCloneScenario(
					empresaCloneScenario(),
					fromCancelados({ hold: 'on', threeDs: false, cardFlow: 'new' })
				);
			});

			test('[TS-STRIPE-P2-TC067] @regression @card-new sin hold clonación cancelado — Vincular tarjeta nueva', async ({
				page
			}) => {
				await new CarrierCloneSteps({ page }).runCloneScenario(
					empresaCloneScenario(),
					fromCancelados({ hold: 'off', threeDs: false, cardFlow: 'new' })
				);
			});

			test('[TS-STRIPE-P2-TC068] @regression @hold @card-existing clonación cancelado hold+cobro — Usar tarjeta vinculada existente', async ({
				page
			}) => {
				await new CarrierCloneSteps({ page }).runCloneScenario(
					empresaCloneScenario(),
					fromCancelados({ hold: 'on', threeDs: false, cardFlow: 'existing' })
				);
			});

			test('[TS-STRIPE-P2-TC069] @regression @card-existing sin hold clonación cancelado — Usar tarjeta vinculada existente', async ({
				page
			}) => {
				await new CarrierCloneSteps({ page }).runCloneScenario(
					empresaCloneScenario(),
					fromCancelados({ hold: 'off', threeDs: false, cardFlow: 'existing' })
				);
			});
		});

		test.describe('Con 3DS', () => {
			test('[TS-STRIPE-P2-TC070] @regression @3ds @hold clonación cancelado hold+cobro 3DS', async ({ page }) => {
				await new CarrierCloneSteps({ page }).runCloneScenario(
					empresaCloneScenario(),
					fromCancelados({ hold: 'on', threeDs: true, cardFlow: 'new' })
				);
			});

			test('[TS-STRIPE-P2-TC071] @regression @3ds sin hold clonación cancelado 3DS', async ({ page }) => {
				await new CarrierCloneSteps({ page }).runCloneScenario(
					empresaCloneScenario(),
					fromCancelados({ hold: 'off', threeDs: true, cardFlow: 'new' })
				);
			});
		});
	}
);
