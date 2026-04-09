/**
 * TCs: TS-STRIPE-TC1081
 * Feature: Cargo a Bordo — Tarjeta de Crédito — Usuario App Pax — Pago exitoso
 * Tags: @smoke @cargo-a-bordo @web-only
 */
import { test } from '../../../../../TestBase';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe('Gateway PG · Carrier · App Pax — Cargo a Bordo', () => {

  test('[TS-STRIPE-TC1081] @smoke @cargo-a-bordo pago exitoso sin 3DS', async () => {
    test.fixme(true, 'PENDIENTE: tarjeta successDirect, flujo cargo a bordo app pax');
  });

});
