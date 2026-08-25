/**
 * TCs: TS-STRIPE-P2-TC084–TC089
 * Feature: Edición en Conflicto — Carrier — Empresa Individuo
 * Precondición: Fallo de 3DS u otro error impide el hold (tarjeta bloqueada, sin fondos)
 * Tags: @regression @3ds @web-only
 *
 * PRECONDICIÓN SELF-CONTAINED (destrabado del fixme "requiere viaje en conflicto"):
 * `CarrierEditVariantsSteps.runConflictEditScenario` compone `RecoverySteps.setupFailedThreeDs`
 * (hold ON + tarjeta 3220 + challenge RECHAZADO → viaje NO_AUTORIZADO en "En conflicto") y edita
 * ESE viaje por deep-link (`travel/detail?travelId=<id>&mode=3` — el FE publica el lápiz de
 * edición para NO_AUTH, `toggleEditButton` del dashboard). Variantes de tarjeta en la edición:
 * nueva débito 8210 (mastercardDebit) / vinculada existente 4242 / nueva con challenge 3DS
 * aprobado (alwaysAuthenticate 3184 — la 3220 del seed ya quedó vinculada y BL-050 bloquea
 * repetir número).
 *
 * VARIANTES "SIN HOLD" (TC085/087/089) — permanecen fixme CON MOTIVO PRECISO: el estado
 * "En conflicto" (NO_AUTORIZADO) sólo se genera cuando el hold del alta FALLA (challenge 3DS
 * rechazado / tarjeta sin fondos) o cuando el cron de holds diferidos falla — ambos requieren
 * hold ACTIVO. Con hold OFF el alta no dispara hold ⇒ no existe precondición reproducible
 * (la combinación "sin Hold desde Alta" × "en conflicto" de la matriz es contradictoria en el
 * flujo web; pendiente revisión de intent de la fila con el QA lead).
 *
 * NOTA 2026-04-19 (matriz_cases2.md): TC088/TC089 figuraban como "Clonación" por un flag
 * `fuera-de-sección` histórico — títulos alineados a "edición conflicto" según la corrección.
 *
 * KATA conformance: test del fixture KATA (@TestFixture); orquestación en
 * `CarrierEditVariantsSteps` (@steps); ATCs en Page components (área EDIT del idmap:
 * linkAndValidatePreauthorizedCard → MG-415, confirmLinkedCardAndSave → MG-416,
 * 3DS → MG-152/153) — mapeo por área aceptado.
 *
 * FRAGILE / TODO(live): deep-link de edición sobre NO_AUTH + comportamiento del guardado
 * (posible re-ejecución del hold) — ver JSDoc de runConflictEditScenario.
 */
import { test } from '@TestFixture';
import { CarrierEditVariantsSteps, type EditSeedScenario } from '@steps/index';
import { TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { PASSENGERS } from '@features/gateway-pg/data/passengers';

function conflictScenario(): EditSeedScenario {
	return {
		// Mismo dataset probado de los specs de recovery (setupFailedThreeDs + TEST_DATA):
		// cliente empresa individuo, pasajero app pax (dueño de la wallet).
		client: TEST_DATA.client,
		passenger: TEST_DATA.appPaxPassenger,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		apiSearchQuery: PASSENGERS.appPax.apiSearchQuery
	};
}

// El fixture KATA no define la opción `role` (login explícito en el Step).
test.use({ storageState: undefined });
test.describe.configure({ timeout: 240_000 });

test.describe(
	'Gateway PG · Carrier · Empresa Individuo — Edición en Conflicto @gateway @stripe @hold @3ds @decline @regression',
	{ annotation: [{ type: 'tms', description: 'MG-415' }] },
	() => {
		test.describe('Sin 3DS', () => {
			test('[TS-STRIPE-P2-TC084] @regression @hold @card-new alta + edición conflicto hold+cobro — Vincular tarjeta nueva', async ({
				page
			}) => {
				// GATE producto (2026-08-07, corrida live): el seed llega VERDE a "En Conflicto" y el ABM
				// mode=3 abre, pero el EDITOR de forma de pago (#add_travel_payment_methods) NO existe
				// para viajes NO_AUTH — "Forma de Pago" es label read-only bajo "Datos Finales"
				// (screenshots evidence/.../stripe-web-carrier-operaci-{fe85d,95195,55f93}). Sujeto del
				// TC bloqueado por cambio/regresion de producto v1.72.8+ (defect report, hallazgo #3).
				test.skip(
					true,
					'BLOQUEADO producto: editor de forma de pago ausente en ABM edicion (mode=3) para viajes NO_AUTH — defect report 2026-08-07'
				);
				// GATE producto (2026-08-07, corrida live): el seed llega VERDE a "En Conflicto" y el ABM
				// mode=3 abre, pero el EDITOR de forma de pago (#add_travel_payment_methods) NO existe
				// para viajes NO_AUTH — "Forma de Pago" es label read-only bajo "Datos Finales"
				// (screenshots evidence/.../stripe-web-carrier-operaci-{fe85d,95195,55f93}). Sujeto del
				// TC bloqueado por cambio/regresion de producto v1.72.8+ (defect report, hallazgo #3).
				test.skip(
					true,
					'BLOQUEADO producto: editor de forma de pago ausente en ABM edicion (mode=3) para viajes NO_AUTH — defect report 2026-08-07'
				);
				await new CarrierEditVariantsSteps({ page }).runConflictEditScenario(conflictScenario(), {
					variant: 'link-new-card'
				});
			});

			test('[TS-STRIPE-P2-TC085] @regression sin hold alta + edición conflicto', async () => {
				test.fixme(
					true,
					'BLOQUEADO por diseño del flujo: "En conflicto" (NO_AUTORIZADO) sólo se genera con hold ACTIVO en el alta (fallo del hold/3DS); con hold OFF no existe precondición reproducible. Revisar intent de la fila "sin Hold" × "conflicto" de la matriz con el QA lead.'
				);
			});

			test('[TS-STRIPE-P2-TC086] @regression @hold @card-existing alta + edición conflicto hold+cobro — Usar tarjeta vinculada existente', async ({
				page
			}) => {
				// GATE producto (2026-08-07, corrida live): el seed llega VERDE a "En Conflicto" y el ABM
				// mode=3 abre, pero el EDITOR de forma de pago (#add_travel_payment_methods) NO existe
				// para viajes NO_AUTH — "Forma de Pago" es label read-only bajo "Datos Finales"
				// (screenshots evidence/.../stripe-web-carrier-operaci-{fe85d,95195,55f93}). Sujeto del
				// TC bloqueado por cambio/regresion de producto v1.72.8+ (defect report, hallazgo #3).
				test.skip(
					true,
					'BLOQUEADO producto: editor de forma de pago ausente en ABM edicion (mode=3) para viajes NO_AUTH — defect report 2026-08-07'
				);
				await new CarrierEditVariantsSteps({ page }).runConflictEditScenario(conflictScenario(), {
					variant: 'select-existing'
				});
			});

			test('[TS-STRIPE-P2-TC087] @regression sin hold alta + edición conflicto variante', async () => {
				test.fixme(
					true,
					'BLOQUEADO por diseño del flujo: "En conflicto" (NO_AUTORIZADO) sólo se genera con hold ACTIVO en el alta; con hold OFF no existe precondición reproducible (ver TC085).'
				);
			});
		});

		test.describe('Con 3DS', () => {
			test('[TS-STRIPE-P2-TC088] @regression @3ds @hold edición conflicto hold+cobro 3DS', async ({ page }) => {
				await new CarrierEditVariantsSteps({ page }).runConflictEditScenario(conflictScenario(), {
					variant: 'link-new-3ds'
				});
			});

			test('[TS-STRIPE-P2-TC089] @regression @3ds sin hold edición conflicto 3DS', async () => {
				test.fixme(
					true,
					'BLOQUEADO por diseño del flujo: "En conflicto" (NO_AUTORIZADO) sólo se genera con hold ACTIVO en el alta; con hold OFF no existe precondición reproducible (ver TC085).'
				);
			});
		});
	}
);
