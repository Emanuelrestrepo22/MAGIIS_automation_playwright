/**
 * TCs: TS-STRIPE-P2-TC072–TC077
 * Feature: Clonación de Viajes Finalizados — Carrier — Empresa Individuo
 * Tags: @regression @web-only
 *
 * KATA conformance (feature/kata-conformance): specs de placeholder (fixme). test del
 * fixture KATA (@TestFixture). Sin ATC aún (no hay flujo implementado). Al implementar,
 * mapear al área CLON del idmap (MG-428+, Level UI) — mapeo por área aceptado.
 */
import { test } from '@TestFixture';

// El fixture KATA no define la opción `role` (login explícito en el flujo cuando se implemente).
test.use({ storageState: undefined });

test.describe('Gateway PG · Carrier · Empresa Individuo — Clonación de Viajes Finalizados @gateway @stripe @hold @3ds @regression', { annotation: [{ type: 'tms', description: 'MG-428' }] }, () => {

  test.describe('Sin 3DS', () => {
    test('[TS-STRIPE-P2-TC072] @regression @hold clonación finalizado hold+cobro', async () => {
      test.fixme(true, 'PENDIENTE: requiere viaje finalizado en TEST');
    });
    test('[TS-STRIPE-P2-TC073] @regression sin hold clonación finalizado', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC072');
    });
    test('[TS-STRIPE-P2-TC074] @regression @hold clonación finalizado hold+cobro variante', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC072');
    });
    test('[TS-STRIPE-P2-TC075] @regression sin hold clonación finalizado variante', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC072');
    });
  });

  test.describe('Con 3DS', () => {
    test('[TS-STRIPE-P2-TC076] @regression @3ds @hold clonación finalizado hold+cobro 3DS', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC072');
    });
    test('[TS-STRIPE-P2-TC077] @regression @3ds sin hold clonación finalizado 3DS', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC072');
    });
  });

});
