/**
 * TCs: TS-STRIPE-TC1081
 * Feature: Cargo a Bordo — Tarjeta de Crédito — Usuario App Pax — Pago exitoso
 * Tags: @smoke @cargo-a-bordo @web-only
 *
 * KATA conformance (feature/kata-conformance): amoldado al patrón de los specs de hold.
 *   - test viene del fixture unificado KATA (@TestFixture) en vez de TestBase.
 *   - fase web compartida extraída al Step `CargoABordoSteps.runCargoScenario` (@steps).
 *   - Page components KATA (@ui/carrier) en vez de los POMs del sustrato carrier.
 * ATCs mapeados en las Page components: fillCargoABordo → MG-161 (área F cobro),
 *   expectPassengerInPorAsignar → MG-158 (área E hold). mapeo por área aceptado (idmap
 *   API-level, sin 1:1 con TS-STRIPE-TC10xx UI).
 *
 * Notas de comportamiento:
 * - Cargo a Bordo NO usa tarjeta ni formulario Stripe en carrier. El cobro y validación
 *   de tarjeta ocurren exclusivamente en la Driver App al finalizar el viaje.
 * - Post-submit el producto puede quedarse en /travel/create?limitExceeded=false como
 *   comportamiento normal (no es un error). Validar creación vía network interception
 *   del POST /travels, no vía URL redirect.
 * - Con cliente app pax el pasajero se auto-asigna — no se pasa `passenger` al escenario.
 */
import { test } from '@TestFixture';
import { CargoABordoSteps, type CargoScenario } from '@steps/index';
import { TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { PASSENGERS } from '@features/gateway-pg/data/passengers';

// El fixture KATA no define la opción `role` (login explícito vía loginAsDispatcher(page)).
test.use({ storageState: undefined });
test.describe.configure({ timeout: 120_000 });

const appPaxScenario: CargoScenario = {
	client: TEST_DATA.appPaxPassenger,
	origin: TEST_DATA.origin,
	destination: TEST_DATA.destination,
	cardPrecondition: { apiSearchQuery: PASSENGERS.appPax.apiSearchQuery!, requiredLast4: '4242', tcLabel: 'TC1081' },
};

test.describe('Gateway PG · Carrier · App Pax — Cargo a Bordo @gateway @stripe @cargo-a-bordo @hold @critical @smoke', { annotation: [{ type: 'tms', description: 'MG-161' }] }, () => {

	test('[TS-STRIPE-TC1081] @smoke @cargo-a-bordo pago exitoso sin 3DS', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario);
	});

});
