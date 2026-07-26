/**
 * TCs: TS-STRIPE-TC1111
 * Feature: Cargo a Bordo — Tarjeta de Crédito — Usuario Empresa Individuo — Pago exitoso
 * Tags: @smoke @cargo-a-bordo @web-only
 *
 * Flujo: carrier web crea viaje con cliente empresa individuo y método "Tarjeta de Crédito - Cargo a Bordo".
 * No hay formulario Stripe ni 3DS desde carrier. El cobro ocurre en Driver App al finalizar.
 * TEST_DATA.client = empresaIndividuo ('Marcelle Stripe'), TEST_DATA.passenger = appPax ('Emanuel Restrepo').
 *
 * NOTA de comportamiento (ex-TODO TC1111): el sistema puede auto-asignar el campo
 * `#passenger` al seleccionar la empresa individuo (`ng-reflect-is-disabled="true"`).
 * El ATC `fillCargoABordo` lo maneja de forma adaptativa: valida el contenido
 * auto-asignado en vez de forzar selectPassenger cuando el campo está deshabilitado.
 *
 * KATA conformance (feature/kata-conformance): fase web extraída a
 *   `CargoABordoSteps.runCargoScenario` (@steps); test desde @TestFixture. ATCs →
 *   MG-161 (área F cobro) / MG-158 (área E hold). mapeo por área aceptado (idmap API-level).
 */
import { test } from '@TestFixture';
import { CargoABordoSteps, type CargoScenario } from '@steps/index';
import { TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';

test.use({ storageState: undefined });
test.describe.configure({ timeout: 120_000 });

const empresaScenario: CargoScenario = {
	client: TEST_DATA.client,
	passenger: TEST_DATA.passenger,
	origin: TEST_DATA.origin,
	destination: TEST_DATA.destination
};

test.describe(
	'Gateway PG · Carrier · Empresa Individuo — Cargo a Bordo @gateway @stripe @cargo-a-bordo @hold @critical @smoke',
	{ annotation: [{ type: 'tms', description: 'MG-161' }] },
	() => {
		test('[TS-STRIPE-TC1111] @smoke @cargo-a-bordo pago exitoso sin 3DS', async ({ page }) => {
			await new CargoABordoSteps({ page }).runCargoScenario(empresaScenario, { createTimeout: 30_000 });
		});
	}
);
