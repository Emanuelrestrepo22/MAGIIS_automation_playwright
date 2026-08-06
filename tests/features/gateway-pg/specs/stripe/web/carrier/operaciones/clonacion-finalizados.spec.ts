/**
 * TCs: TS-STRIPE-P2-TC072–TC077
 * Feature: Clonación de Viajes Finalizados — Carrier — Empresa Individuo
 * Tags: @regression @web-only
 *
 * PRECONDICIÓN SELF-CONTAINED (destrabado del fixme "requiere viaje finalizado en TEST"):
 * la App Driver NO es necesaria — la máquina de estados del BE admite CANCELLED → DONE
 * ("finalización administrativa", el mismo botón bandera del portal carrier). Cada test:
 *   1. crea el viaje fuente vía `CarrierHoldSteps.runHoldScenario` (queda CANCELADO por su
 *      cleanup interno, con el hold ya liberado por la cancelación),
 *   2. lo FINALIZA por API (`finalizeTravelAdmin` → POST /travels/{id}/finalizeAdmin), y
 *   3. lo clona desde la pestaña Finalizados y da de alta el CLON con tarjeta preautorizada.
 *
 * ⚠️ CAVEAT de fidelidad (documentado en travel-finalize.ts): al finalizar administrativamente,
 * el BE convierte el pago del viaje FUENTE a CASH — la pata "Cobro desde App Driver" del viaje
 * fuente no es reproducible web-only (se ejercita en Stage 5 con APPIUM). El SUJETO del TC
 * (clonar un viaje FINALIZADO y validar el alta del clon con tarjeta preautorizada + hold)
 * se ejercita fiel a la matriz.
 *
 * KATA conformance: test del fixture KATA (@TestFixture); orquestación en `CarrierCloneSteps`
 * (@steps); ATC de clonación en `CarrierTravelManagementPage.cloneTravel` → MG-428 (área CLON
 * del idmap, mapeo por área aceptado).
 *
 * FRAGILE / TODO(live): finalizeAdmin (driver con vehículo vigente, ver travel-finalize.ts),
 * pestaña Finalizados y form precargado derivados del código FE/BE — sin corrida viva aún.
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

function fromFinalizados(options: Omit<CloneRunOptions, 'source'>): CloneRunOptions {
	return { source: 'finalizados', ...options };
}

// El fixture KATA no define la opción `role` (login explícito dentro del seed runHoldScenario).
test.use({ storageState: undefined });
// Alta fuente + cancelación + finalización administrativa + clonado + alta del clon.
test.describe.configure({ timeout: 300_000 });

test.describe(
	'Gateway PG · Carrier · Empresa Individuo — Clonación de Viajes Finalizados @gateway @stripe @hold @3ds @regression',
	{ annotation: [{ type: 'tms', description: 'MG-428' }] },
	() => {
		test.describe('Sin 3DS', () => {
			test('[TS-STRIPE-P2-TC072] @regression @hold @card-new clonación finalizado hold+cobro — Vincular tarjeta nueva', async ({
				page
			}) => {
				await new CarrierCloneSteps({ page }).runCloneScenario(
					empresaCloneScenario(),
					fromFinalizados({ hold: 'on', threeDs: false, cardFlow: 'new' })
				);
			});

			test('[TS-STRIPE-P2-TC073] @regression @card-new sin hold clonación finalizado — Vincular tarjeta nueva', async ({
				page
			}) => {
				await new CarrierCloneSteps({ page }).runCloneScenario(
					empresaCloneScenario(),
					fromFinalizados({ hold: 'off', threeDs: false, cardFlow: 'new' })
				);
			});

			test('[TS-STRIPE-P2-TC074] @regression @hold @card-existing clonación finalizado hold+cobro — Usar tarjeta vinculada existente', async ({
				page
			}) => {
				await new CarrierCloneSteps({ page }).runCloneScenario(
					empresaCloneScenario(),
					fromFinalizados({ hold: 'on', threeDs: false, cardFlow: 'existing' })
				);
			});

			test('[TS-STRIPE-P2-TC075] @regression @card-existing sin hold clonación finalizado — Usar tarjeta vinculada existente', async ({
				page
			}) => {
				await new CarrierCloneSteps({ page }).runCloneScenario(
					empresaCloneScenario(),
					fromFinalizados({ hold: 'off', threeDs: false, cardFlow: 'existing' })
				);
			});
		});

		test.describe('Con 3DS', () => {
			test('[TS-STRIPE-P2-TC076] @regression @3ds @hold clonación finalizado hold+cobro 3DS', async ({ page }) => {
				await new CarrierCloneSteps({ page }).runCloneScenario(
					empresaCloneScenario(),
					fromFinalizados({ hold: 'on', threeDs: true, cardFlow: 'new' })
				);
			});

			test('[TS-STRIPE-P2-TC077] @regression @3ds sin hold clonación finalizado 3DS', async ({ page }) => {
				await new CarrierCloneSteps({ page }).runCloneScenario(
					empresaCloneScenario(),
					fromFinalizados({ hold: 'off', threeDs: true, cardFlow: 'new' })
				);
			});
		});
	}
);
