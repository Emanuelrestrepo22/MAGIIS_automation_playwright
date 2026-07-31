/**
 * TCs: TS-STRIPE-P2-TC011–TC018
 * Feature: Flujo Quote — Colaborador (teléfono + mail)
 * Tags: @regression @quote @web-only
 *
 * KATA conformance (feature/kata-conformance): specs de placeholder (fixme). test del
 * fixture KATA (@TestFixture). Sin ATC aún (no hay flujo implementado). Al implementar,
 * mapear al área QUOTE del idmap (MG-361+, Level UI) — mapeo por área aceptado.
 */
import { test } from '@TestFixture';

// El fixture KATA no define la opción `role` (login explícito en el flujo cuando se implemente).
test.use({ storageState: undefined });

test.describe(
	'Gateway PG · Quote · Colaborador @gateway @stripe @hold @3ds @regression',
	{ annotation: [{ type: 'tms', description: 'MG-361' }] },
	() => {
		test.describe('Via número de teléfono — sin 3DS', () => {
			test('[TS-STRIPE-P2-TC011] @regression @quote @hold quote colaborador teléfono hold+cobro', async () => {
				test.fixme(true, 'PENDIENTE: Page Object QuotePage no implementado');
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
	}
);
