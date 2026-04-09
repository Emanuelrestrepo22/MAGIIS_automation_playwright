/**
 * TCs: TS-STRIPE-TC1107–TC1110
 * Feature: Cargo a Bordo — Colaborador/Asociado Contractor — 3D Secure
 * Tags: @critical @3ds @cargo-a-bordo @web-only
 */
import { test } from '../../../../../TestBase';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe('Gateway PG · Carrier · Colaborador — Cargo a Bordo · 3DS', () => {

  test('[TS-STRIPE-TC1107] @critical @3ds @cargo-a-bordo pago exitoso con 3DS obligatorio', async () => {
    test.fixme(true, 'PENDIENTE: tarjeta success3DS, usuario colaborador');
  });
  test('[TS-STRIPE-TC1108] @regression @3ds @cargo-a-bordo pago rechazado con 3DS', async () => {
    test.fixme(true, 'PENDIENTE: tarjeta fail3DS, usuario colaborador');
  });
  test('[TS-STRIPE-TC1109] @regression @3ds @cargo-a-bordo error con 3DS', async () => {
    test.fixme(true, 'PENDIENTE: depende de TC1107');
  });
  test('[TS-STRIPE-TC1110] @regression @3ds @cargo-a-bordo falla 3DS', async () => {
    test.fixme(true, 'PENDIENTE: depende de TC1108');
  });

});
