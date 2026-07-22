/**
 * TCs: TS-STRIPE-TC1096
 * Feature: Cargo a Bordo — Tarjeta de Crédito — Usuario Colaborador/Contractor — Pago exitoso
 * Tags: @smoke @cargo-a-bordo @web-only
 *
 * Evidencia: test-13.spec.ts
 * Flujo: carrier web crea viaje con cliente contractor y método "Tarjeta de Crédito - Cargo a Bordo".
 * No hay formulario Stripe ni 3DS desde carrier. El cobro ocurre en Driver App al finalizar.
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

const contractorScenario: CargoScenario = {
	client: TEST_DATA.contractorClient,
	passenger: TEST_DATA.contractorPassenger,
	origin: TEST_DATA.origin,
	destination: TEST_DATA.destination,
};

test.describe('Gateway PG · Carrier · Colaborador/Contractor — Cargo a Bordo @gateway @stripe @cargo-a-bordo @hold @critical @smoke', () => {

	test('[TS-STRIPE-TC1096] @smoke @cargo-a-bordo pago exitoso sin 3DS', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(contractorScenario, { createTimeout: 30_000 });
	});

});
