/**
 * TCs: TS-STRIPE-P2-TC001–TC006
 * Feature: Portal Contractor — Alta de Tarjetas y Vinculación
 * Tags: @smoke @contractor @web-only
 */
import { test } from '../../../../TestBase';

test.use({ role: 'contractor', storageState: { cookies: [], origins: [] } });

test.describe('Gateway PG · Contractor — Vinculación de Tarjeta', () => {

  test.describe('Sin 3DS', () => {
    test('[TS-STRIPE-P2-TC001] @smoke @contractor @hold vinculación + alta hold+cobro colaborador', async () => {
      test.fixme(true, 'PENDIENTE: portal contractor — requiere usuario contractor activo en TEST');
    });
    test('[TS-STRIPE-P2-TC002] @regression @contractor sin hold vinculación + alta colaborador', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC001');
    });
    test('[TS-STRIPE-P2-TC003] @regression @contractor @hold selección tarjeta + alta hold+cobro', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC001');
    });
    test('[TS-STRIPE-P2-TC004] @regression @contractor sin hold selección tarjeta + alta', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC001');
    });
  });

  test.describe('Con 3DS', () => {
    test('[TS-STRIPE-P2-TC005] @regression @contractor @3ds @hold vinculación + alta hold+cobro 3DS', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC001');
    });
    test('[TS-STRIPE-P2-TC006] @regression @contractor @3ds sin hold vinculación + alta 3DS', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC001');
    });
  });

});
