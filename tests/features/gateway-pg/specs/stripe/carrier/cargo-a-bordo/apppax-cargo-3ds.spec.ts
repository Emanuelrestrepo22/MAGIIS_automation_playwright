/**
 * TCs: TS-STRIPE-TC1092–TC1095
 * Feature: Cargo a Bordo — Tarjeta de Crédito — Usuario App Pax — 3D Secure
 * Tags: @critical @3ds @cargo-a-bordo @web-only
 */
import { test } from '../../../../../../TestBase';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe('Gateway PG · Carrier · App Pax — Cargo a Bordo · 3DS', () => {

  test('[TS-STRIPE-TC1092] @critical @3ds @cargo-a-bordo pago exitoso con 3DS obligatorio', async () => {
    test.fixme(true, 'PENDIENTE: tarjeta success3DS, flujo cargo a bordo');
  });
  test('[TS-STRIPE-TC1093] @regression @3ds @cargo-a-bordo pago rechazado con 3DS obligatorio', async () => {
    test.fixme(true, 'PENDIENTE: tarjeta fail3DS, cargo a bordo');
  });
  test('[TS-STRIPE-TC1094] @regression @3ds @cargo-a-bordo error con 3DS obligatorio', async () => {
    test.fixme(true, 'PENDIENTE: tarjeta 3DS error — agregar a stripe-cards.ts');
  });
  test('[TS-STRIPE-TC1095] @regression @3ds @cargo-a-bordo falla 3DS', async () => {
    test.fixme(true, 'PENDIENTE: depende de TC1093');
  });

});
