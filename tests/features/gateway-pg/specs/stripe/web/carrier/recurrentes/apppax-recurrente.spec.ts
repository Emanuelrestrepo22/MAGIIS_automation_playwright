/**
 * TCs: TS-STRIPE-P2-TC048–TC053 (docs/gateway-pg/stripe/matriz_cases2.md §5 "Usuario Personal")
 * Feature: Viajes Recurrentes — Portal Carrier — Usuario App Pax (personal)
 * Tags: @regression @recurrente @web-only
 *
 * Ejes de la matriz: vinculación (card-new) / selección (card-existing) de tarjeta × Hold ON/OFF
 * × con/sin 3DS sobre el ALTA RECURRENTE. El tramo "Cobro desde App Driver" del título es la
 * fase mobile, fuera del alcance web (mismo recorte que la suite de hold — TC1301-1303).
 *
 * Actor: usuario personal App Pax 'Emanuel Restrepo' (PASSENGERS.appPax — cliente y pasajero,
 * mismo combo que la suite de hold apppax-*). Oráculos + arquitectura del alta recurrente:
 * ver header de `RecurrentesSteps` (POST /travels único con recurringValue en payload).
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

function appPaxScenario(cardFlow: CardFlow): RecurrentScenario {
	return {
		client: TEST_DATA.appPaxPassenger,
		passenger: TEST_DATA.appPaxPassenger,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		apiSearchQuery: PASSENGERS.appPax.apiSearchQuery,
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
	'Gateway PG · Carrier · App Pax — Viajes Recurrentes @gateway @stripe @hold @regression',
	{ annotation: [{ type: 'tms', description: 'MG-390' }] },
	() => {
		test('[TS-STRIPE-P2-TC048] @regression @recurrente @hold vinculación + recurrente hold+cobro app pax', async ({
			page
		}) => {
			await new RecurrentesSteps({ page }).runRecurrentScenario(appPaxScenario('new'), {
				hold: 'on',
				threeDs: false
			});
		});

		test('[TS-STRIPE-P2-TC049] @regression @recurrente sin hold vinculación + recurrente app pax', async ({
			page
		}) => {
			await new RecurrentesSteps({ page }).runRecurrentScenario(appPaxScenario('new'), {
				hold: 'off',
				threeDs: false
			});
		});

		test('[TS-STRIPE-P2-TC050] @regression @recurrente @hold selección tarjeta + recurrente hold+cobro', async ({
			page
		}) => {
			await new RecurrentesSteps({ page }).runRecurrentScenario(appPaxScenario('existing'), {
				hold: 'on',
				threeDs: false
			});
		});

		test('[TS-STRIPE-P2-TC051] @regression @recurrente sin hold selección tarjeta + recurrente', async ({
			page
		}) => {
			await new RecurrentesSteps({ page }).runRecurrentScenario(appPaxScenario('existing'), {
				hold: 'off',
				threeDs: false
			});
		});

		test('[TS-STRIPE-P2-TC052] @regression @recurrente @3ds vinculación + recurrente hold+cobro 3DS', async ({
			page
		}) => {
			await new RecurrentesSteps({ page }).runRecurrentScenario(appPaxScenario('new'), {
				hold: 'on',
				threeDs: true
			});
		});

		test('[TS-STRIPE-P2-TC053] @regression @recurrente @3ds sin hold vinculación + recurrente 3DS', async ({
			page
		}) => {
			await new RecurrentesSteps({ page }).runRecurrentScenario(appPaxScenario('new'), {
				hold: 'off',
				threeDs: true
			});
		});
	}
);
