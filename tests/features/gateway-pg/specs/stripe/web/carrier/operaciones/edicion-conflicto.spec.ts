/**
 * TCs: TS-STRIPE-P2-TC084–TC089
 * Feature: Edición en Conflicto — Carrier — Empresa Individuo
 * Precondición: Fallo de 3DS u otro error impide el hold (tarjeta bloqueada, sin fondos)
 * Tags: @regression @3ds @web-only
 *
 * KATA conformance (feature/kata-conformance): specs de placeholder (fixme). test del
 * fixture KATA (@TestFixture). Sin ATC aún (no hay flujo implementado). Al implementar,
 * mapear al área EDIT del idmap (MG-415+, Level UI) — mapeo por área aceptado.
 */
import { test } from '@TestFixture';

// El fixture KATA no define la opción `role` (login explícito en el flujo cuando se implemente).
test.use({ storageState: undefined });

test.describe('Gateway PG · Carrier · Empresa Individuo — Edición en Conflicto @gateway @stripe @hold @3ds @decline @regression', () => {
	test.describe('Sin 3DS', () => {
		test('[TS-STRIPE-P2-TC084] @regression @hold alta + edición conflicto hold+cobro', async () => {
			test.fixme(true, 'PENDIENTE: requiere viaje en conflicto — hold fallido previo');
		});
		test('[TS-STRIPE-P2-TC085] @regression sin hold alta + edición conflicto', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC084');
		});
		test('[TS-STRIPE-P2-TC086] @regression @hold alta + edición conflicto hold+cobro variante', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC084');
		});
		test('[TS-STRIPE-P2-TC087] @regression sin hold alta + edición conflicto variante', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC084');
		});
	});

	test.describe('Con 3DS', () => {
		test('[TS-STRIPE-P2-TC088] @regression @3ds @hold clonación conflicto hold+cobro 3DS', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC084');
		});
		test('[TS-STRIPE-P2-TC089] @regression @3ds sin hold clonación conflicto 3DS', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC084');
		});
	});
});
