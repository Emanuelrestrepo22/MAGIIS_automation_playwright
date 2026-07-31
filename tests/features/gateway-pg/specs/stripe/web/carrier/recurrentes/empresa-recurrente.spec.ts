/**
 * TCs: TS-STRIPE-P2-TC054–TC059
 * Feature: Viajes Recurrentes — Portal Carrier — Usuario Empresa Individuo
 * Tags: @regression @recurrente @web-only
 *
 * KATA conformance (feature/kata-conformance): specs de placeholder (fixme). test del
 * fixture KATA (@TestFixture). Sin ATC aún (no hay flujo implementado). Al implementar,
 * mapear al área REC del idmap (MG-390+, Level UI) — PENDIENTE REASIGNAR.
 */
import { test } from '@TestFixture';

// El fixture KATA no define la opción `role` (login explícito en el flujo cuando se implemente).
test.use({ storageState: undefined });

test.describe('Gateway PG · Carrier · Empresa Individuo — Viajes Recurrentes @gateway @stripe @hold @regression', () => {
	test('[TS-STRIPE-P2-TC054] @regression @recurrente @hold vinculación + recurrente hold+cobro empresa', async () => {
		test.fixme(
			true,
			'DEUDA TÉCNICA MG-178: viajes recurrentes con pasarela preautorizada no desarrollados/estables para validación en esta release; diferido a próxima iteración de cambios en pasarelas de pago. POM scaffolded: CarrierRecurrentTravelPage/RecurrentesSteps.'
		);
	});
	test('[TS-STRIPE-P2-TC055] @regression @recurrente sin hold vinculación + recurrente empresa', async () => {
		test.fixme(true, 'PENDIENTE: depende de P2-TC054');
	});
	test('[TS-STRIPE-P2-TC056] @regression @recurrente @hold selección tarjeta + recurrente hold+cobro', async () => {
		test.fixme(true, 'PENDIENTE: depende de P2-TC054');
	});
	test('[TS-STRIPE-P2-TC057] @regression @recurrente sin hold selección tarjeta + recurrente', async () => {
		test.fixme(true, 'PENDIENTE: depende de P2-TC054');
	});
	test('[TS-STRIPE-P2-TC058] @regression @recurrente @3ds vinculación + recurrente hold+cobro 3DS', async () => {
		test.fixme(true, 'PENDIENTE: depende de P2-TC054');
	});
	test('[TS-STRIPE-P2-TC059] @regression @recurrente @3ds sin hold vinculación + recurrente 3DS', async () => {
		test.fixme(true, 'PENDIENTE: depende de P2-TC054');
	});
});
