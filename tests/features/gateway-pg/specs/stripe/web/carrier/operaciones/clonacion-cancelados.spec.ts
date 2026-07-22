/**
 * TCs: TS-STRIPE-P2-TC066–TC071
 * Feature: Clonación de Viajes Cancelados — Carrier — Empresa Individuo
 * Tags: @regression @web-only
 *
 * KATA conformance (feature/kata-conformance): specs de placeholder (fixme). test del
 * fixture KATA (@TestFixture). Sin ATC aún (no hay flujo implementado). Al implementar,
 * mapear al área CLON del idmap (MG-428+, Level UI) — mapeo por área aceptado.
 */
import { test } from '@TestFixture';

// El fixture KATA no define la opción `role` (login explícito en el flujo cuando se implemente).
test.use({ storageState: undefined });

test.describe('Gateway PG · Carrier · Empresa Individuo — Clonación de Viajes Cancelados @gateway @stripe @hold @3ds @regression', () => {

  test.describe('Sin 3DS', () => {
    test('[TS-STRIPE-P2-TC066] @regression @hold clonación cancelado hold+cobro', async () => {
      test.fixme(true, 'PENDIENTE: requiere viaje cancelado en TEST');
    });
    test('[TS-STRIPE-P2-TC067] @regression sin hold clonación cancelado', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC066');
    });
    test('[TS-STRIPE-P2-TC068] @regression @hold clonación cancelado hold+cobro variante', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC066');
    });
    test('[TS-STRIPE-P2-TC069] @regression sin hold clonación cancelado variante', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC066');
    });
  });

  test.describe('Con 3DS', () => {
    test('[TS-STRIPE-P2-TC070] @regression @3ds @hold clonación cancelado hold+cobro 3DS', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC066');
    });
    test('[TS-STRIPE-P2-TC071] @regression @3ds sin hold clonación cancelado 3DS', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC066');
    });
  });

});
