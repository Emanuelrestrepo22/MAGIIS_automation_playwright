/**
 * TCs: TS-STRIPE-P2-TC041–TC047 (docs/gateway-pg/stripe/matriz_cases2.md §4)
 * Feature: Viajes Recurrentes — Portal Carrier — Usuario Colaboradores
 * Tags: @regression @recurrente @web-only
 * Nota: TC047 marcado como CASO CRÍTICO en la fuente — queda fixme (oráculo en App Driver).
 *
 * Ejes de la matriz: vinculación (card-new) / selección (card-existing) de tarjeta × Hold ON/OFF
 * × con/sin 3DS sobre el ALTA RECURRENTE. El tramo "Cobro desde App Driver" del título es la
 * fase mobile, fuera del alcance web (mismo recorte que la suite de hold — TC1301-1303).
 *
 * ORÁCULO DE CREACIÓN (fuente FE/BE — ver header de RecurrentesSteps): el alta recurrente es el
 * POST /travels de siempre con recurringValue/recurringEnd en el payload (NO hay endpoint
 * propio); el BE crea el RecurringTrip + el travel SCHEDULED en ese POST. Se verifica: travelId
 * capturado + fila válida en PROGRAMADOS + recurrencia listada en "Viajes Recurrentes".
 *
 * KATA conformance: test del fixture KATA (@TestFixture); orquestación compartida en
 * `RecurrentesSteps.runRecurrentScenario` (@steps); ATC del área REC en
 * `CarrierRecurrentTravelPage.configureRecurrence` → MG-390 (mapeo por área aceptado).
 * FRAGILE/TODO(live): fase modal de recurrencia derivada del código FE sin corrida viva.
 */
import { test } from '@TestFixture';
import { RecurrentesSteps, type CardFlow, type RecurrentScenario } from '@steps/index';
import { TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { PASSENGERS } from '@features/gateway-pg/data/passengers';
import { ensureHoldRestoredOn } from '@features/gateway-pg/helpers/parameters-api';

function colaboradorScenario(cardFlow: CardFlow): RecurrentScenario {
	return {
		client: TEST_DATA.contractorClient,
		passenger: TEST_DATA.contractorPassenger,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
		cardFlow
	};
}

// El fixture KATA no define la opción `role` (login explícito en RecurrentesSteps).
test.use({ storageState: undefined });
// 240s: mismo presupuesto que los precedentes quote/Authorize (review MEDIUM-4) — el flujo real
// (alta + modal de recurrencia + oráculos API/UI + cleanup) no entra consistentemente en 180s.
test.describe.configure({ timeout: 240_000 });

// Red de seguridad del hold (review MEDIUM-4): un timeout ABORTA el finally del orquestador y
// dejaría el carrier compartido sin hold; el afterEach SÍ corre tras el timeout (precedente
// hold-capture.spec.ts) y re-asegura ON de forma idempotente (no-op si ya está ON).
test.afterEach(async ({ page }) => {
	await ensureHoldRestoredOn(page);
});

test.describe(
	'Gateway PG · Carrier · Colaborador — Viajes Recurrentes @gateway @stripe @hold @wallet @regression',
	{ annotation: [{ type: 'tms', description: 'MG-390' }] },
	() => {
		test.describe('Vinculación de tarjeta', () => {
			test('[TS-STRIPE-P2-TC041] @regression @recurrente @hold vinculación + recurrente hold+cobro', async ({
				page
			}) => {
				await new RecurrentesSteps({ page }).runRecurrentScenario(colaboradorScenario('new'), {
					hold: 'on',
					threeDs: false
				});
			});

			test('[TS-STRIPE-P2-TC042] @regression @recurrente sin hold vinculación + recurrente', async ({ page }) => {
				await new RecurrentesSteps({ page }).runRecurrentScenario(colaboradorScenario('new'), {
					hold: 'off',
					threeDs: false
				});
			});

			test('[TS-STRIPE-P2-TC045] @regression @recurrente @3ds vinculación + recurrente hold+cobro 3DS', async ({
				page
			}) => {
				// BLOQUEADO producto (mismo patrón confirmado en TC052/apppax-recurrente.spec.ts,
				// evidencia 2026-08-11): el alta recurrente hold=ON+3DS=true aprueba el 3DS pero el
				// viaje no aterriza en "Programados" (queda en Asignar). Reproducido acá con el
				// mismo error exacto (expectTripRowInCurrentTab timeout tras 30s de re-fetch activo)
				// — confirma que es sistémico, no aislado a un actor. Reportar, no enmascarar.
				test.skip(true, 'BLOQUEADO producto: alta recurrente hold=ON+3DS=true no aterriza en Programados (queda en Asignar) — evidencia 2026-08-11, mismo patrón que TC052');
				await new RecurrentesSteps({ page }).runRecurrentScenario(colaboradorScenario('new'), {
					hold: 'on',
					threeDs: true
				});
			});

			test('[TS-STRIPE-P2-TC046] @regression @recurrente @3ds sin hold vinculación + recurrente 3DS', async ({
				page
			}) => {
				await new RecurrentesSteps({ page }).runRecurrentScenario(colaboradorScenario('new'), {
					hold: 'off',
					threeDs: true
				});
			});
		});

		test.describe('Selección de tarjeta existente', () => {
			test('[TS-STRIPE-P2-TC043] @regression @recurrente @hold selección tarjeta + recurrente hold+cobro', async ({
				page
			}) => {
				await new RecurrentesSteps({ page }).runRecurrentScenario(colaboradorScenario('existing'), {
					hold: 'on',
					threeDs: false
				});
			});

			test('[TS-STRIPE-P2-TC044] @regression @recurrente sin hold selección tarjeta + recurrente', async ({
				page
			}) => {
				await new RecurrentesSteps({ page }).runRecurrentScenario(colaboradorScenario('existing'), {
					hold: 'off',
					threeDs: false
				});
			});
		});

		test.describe('Edición de fechas — CASO CRÍTICO', () => {
			test('[TS-STRIPE-P2-TC047] @critical @recurrente @3ds edición de fechas — validar consistencia y cobro', async () => {
				// El oráculo del TC (consistencia de datos + finalización/cobro tras editar fechas)
				// vive en la App Driver — la superficie web (modal app-recurring-edit) ya está
				// modelada en CarrierRecurrentTravelPage.editRecurrenceDates para cuando se destrabe.
				test.fixme(true, 'requiere App Driver — se destraba con APPIUM (Stage 5)');
			});
		});
	}
);
