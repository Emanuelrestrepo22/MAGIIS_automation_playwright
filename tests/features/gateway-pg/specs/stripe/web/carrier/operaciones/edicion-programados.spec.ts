/**
 * TCs: TS-STRIPE-P2-TC078-TC083
 * Feature: Edicion de Viajes Programados - Carrier - Empresa Individuo
 * Tags: @regression @web-only
 *
 * TC078 (ancla verde) conserva su flujo original (`CarrierTravelEditSteps.runScheduledTripCardEdit`
 * sobre el primer viaje programado existente — sin cambios). Las variantes TC079..083 quedan
 * destrabadas con precondición SELF-CONTAINED ("Alta de viaje y edición", fiel a la matriz):
 * `CarrierEditVariantsSteps.runScheduledEditScenario` crea SU PROPIO viaje programado (alta con
 * tarjeta 4242 + horario futuro del día vía `schedulePickupAtLastSlot`) y lo edita por deep-link
 * (`travel/detail?travelId=<id>&mode=3` — determinista, sin depender de la primera fila).
 *
 * Ejes de la matriz: hold ON/OFF (API + read-back crudo) × tarjeta en la EDICIÓN
 * (nueva débito sin 3DS / vinculada existente 4242 / nueva con challenge 3DS aprobado).
 * NOTA 2026-04-19 (matriz_cases2.md): TC082/TC083 figuraban como "Clonación" por un flag
 * `fuera-de-sección` histórico — títulos alineados a "edición programado" según la corrección.
 *
 * KATA conformance (feature/kata-conformance): test/expect del fixture KATA (@TestFixture);
 * orquestación de variantes en `CarrierEditVariantsSteps` (@steps); Page components @ui/carrier
 * (`CarrierNewTravelPage`, `CarrierTravelDetailPage`) + 3DS @ui (`ThreeDsChallengePage`).
 * ATCs mapeados en las Page components (área EDIT del idmap): linkAndValidatePreauthorizedCard
 *   → MG-415, confirmLinkedCardAndSave → MG-416, 3DS success/fail → MG-152/153.
 *   mapeo por área aceptado (idmap sin 1:1 entre TS-STRIPE-P2-TC078xx UI y TC-PAY-EDIT-*).
 *
 * FRAGILE / TODO(live): selector de hora (`schedulePickupAtLastSlot`) y deep-link de edición
 * derivados del código FE — validar en la primera corrida viva (ver JSDoc de los Steps).
 */
import { test } from '@TestFixture';
import { CarrierEditVariantsSteps, CarrierTravelEditSteps, type EditSeedScenario } from '@steps/index';
import { TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { PASSENGERS } from '@features/gateway-pg/data/passengers';

function empresaEditScenario(): EditSeedScenario {
	return {
		client: PASSENGERS.empresaIndividuo.name,
		passenger: PASSENGERS.empresaIndividuo.name,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		apiSearchQuery: PASSENGERS.empresaIndividuo.apiSearchQuery
	};
}

// El fixture KATA no define la opción `role` (login explícito vía loginAsDispatcher(page)).
test.use({ storageState: undefined });
test.describe.configure({ mode: 'serial' });

test.describe(
	'Gateway PG · Carrier · Empresa Individuo - Edicion de Viajes Programados @gateway @stripe @hold @3ds @regression',
	{ annotation: [{ type: 'tms', description: 'MG-415' }] },
	() => {
		test('[TS-STRIPE-P2-TC078] @regression @hold alta + edicion hold+cobro', async ({ page }) => {
			test.setTimeout(180_000);
			await new CarrierTravelEditSteps({ page }).runScheduledTripCardEdit();
		});

		test.describe('Sin 3DS', () => {
			test('[TS-STRIPE-P2-TC079] @regression @card-new sin hold alta + edicion — Vincular tarjeta nueva', async ({
				page
			}) => {
				test.setTimeout(300_000); // alta programada (seed) + edición + restore hold
				await new CarrierEditVariantsSteps({ page }).runScheduledEditScenario(empresaEditScenario(), {
					hold: 'off',
					variant: 'link-new-card'
				});
			});

			test('[TS-STRIPE-P2-TC080] @regression @hold @card-existing alta + edicion hold+cobro — Usar tarjeta vinculada existente', async ({
				page
			}) => {
				test.setTimeout(300_000);
				// La 4242 queda vinculada por el propio seed → la edición la selecciona como existente.
				await new CarrierEditVariantsSteps({ page }).runScheduledEditScenario(empresaEditScenario(), {
					hold: 'on',
					variant: 'select-existing'
				});
			});

			test('[TS-STRIPE-P2-TC081] @regression @card-existing sin hold alta + edicion — Usar tarjeta vinculada existente', async ({
				page
			}) => {
				test.setTimeout(300_000);
				await new CarrierEditVariantsSteps({ page }).runScheduledEditScenario(empresaEditScenario(), {
					hold: 'off',
					variant: 'select-existing'
				});
			});
		});

		test.describe('Con 3DS', () => {
			test('[TS-STRIPE-P2-TC082] @regression @3ds @hold edicion programado hold+cobro 3DS', async ({ page }) => {
				test.setTimeout(300_000);
				await new CarrierEditVariantsSteps({ page }).runScheduledEditScenario(empresaEditScenario(), {
					hold: 'on',
					variant: 'link-new-3ds'
				});
			});

			test('[TS-STRIPE-P2-TC083] @regression @3ds sin hold edicion programado 3DS', async ({ page }) => {
				test.setTimeout(300_000);
				await new CarrierEditVariantsSteps({ page }).runScheduledEditScenario(empresaEditScenario(), {
					hold: 'off',
					variant: 'link-new-3ds'
				});
			});
		});
	}
);
