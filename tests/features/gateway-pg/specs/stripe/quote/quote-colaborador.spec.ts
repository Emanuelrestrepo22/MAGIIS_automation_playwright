/**
 * TCs: TS-STRIPE-P2-TC011–TC018
 * Feature: Flujo Quote — Colaborador (teléfono + mail)
 * Tags: @regression @quote @web-only
 *
 * KATA conformance (feature/kata-conformance): specs de placeholder (fixme). test del
 * fixture KATA (@TestFixture). Sin ATC aún (no hay flujo implementado). Al implementar,
 * mapear al área QUOTE del idmap (MG-361+, Level UI) — PENDIENTE REASIGNAR.
 */
import { test } from '@TestFixture';

// El fixture KATA no define la opción `role` (login explícito en el flujo cuando se implemente).
test.use({ storageState: undefined });

test.describe('Gateway PG · Quote · Colaborador @gateway @stripe @hold @3ds @regression', () => {
	test.describe('Via número de teléfono — sin 3DS', () => {
		test('[TS-STRIPE-P2-TC011] @regression @quote @hold quote colaborador teléfono hold+cobro', async () => {
			// MG-178: POM scaffolded → CarrierQuotePage (@ui/carrier) + QuoteSteps (@steps), selectores reales del FE.
			test.fixme(
				true,
				'DEUDA TÉCNICA MG-178: cotización con pasarela preautorizada no desarrollada/estable para validación en esta release (el form /quote usa MercadoPago, sin challenge 3DS Stripe); diferido a próxima iteración de cambios en pasarelas de pago. POM scaffolded: CarrierQuotePage/QuoteSteps.'
			);
		});
		test('[TS-STRIPE-P2-TC012] @regression @quote sin hold quote colaborador teléfono', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC011');
		});
	});

	test.describe('Via mail — sin 3DS', () => {
		test('[TS-STRIPE-P2-TC013] @regression @quote @hold quote colaborador mail hold+cobro', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC011');
		});
		test('[TS-STRIPE-P2-TC014] @regression @quote sin hold quote colaborador mail', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC011');
		});
	});

	test.describe('Via número de teléfono — con 3DS', () => {
		test('[TS-STRIPE-P2-TC015] @regression @quote @3ds @hold quote colaborador teléfono hold+cobro 3DS', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC011');
		});
		test('[TS-STRIPE-P2-TC016] @regression @quote @3ds sin hold quote colaborador teléfono 3DS', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC011');
		});
	});

	test.describe('Via mail — con 3DS', () => {
		test('[TS-STRIPE-P2-TC017] @regression @quote @3ds @hold quote colaborador mail hold+cobro 3DS', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC011');
		});
		test('[TS-STRIPE-P2-TC018] @regression @quote @3ds sin hold quote colaborador mail 3DS', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC011');
		});
	});
});
