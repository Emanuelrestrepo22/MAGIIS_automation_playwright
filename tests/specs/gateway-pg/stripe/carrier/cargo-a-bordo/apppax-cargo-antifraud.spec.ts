/**
 * TCs: TS-STRIPE-TC1087–TC1091
 * Feature: Cargo a Bordo — Tarjeta de Crédito — Usuario App Pax — Antifraude
 * Tags: @regression @antifraud @cargo-a-bordo @web-only
 */
import { test } from '../../../../../TestBase';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe('Gateway PG · Carrier · App Pax — Cargo a Bordo · Antifraude', () => {

  test('[TS-STRIPE-TC1087] @regression @antifraud falla comprobación CVC', async () => {
    test.fixme(true, 'PENDIENTE: tarjeta cvc_check_fail — agregar a stripe-cards.ts');
  });
  test('[TS-STRIPE-TC1088] @regression @antifraud riesgo máximo', async () => {
    test.fixme(true, 'PENDIENTE: tarjeta highest_risk — agregar a stripe-cards.ts');
  });
  test('[TS-STRIPE-TC1089] @regression @antifraud tarjeta siempre bloqueada', async () => {
    test.fixme(true, 'PENDIENTE: tarjeta always_blocked — agregar a stripe-cards.ts');
  });
  test('[TS-STRIPE-TC1090] @regression @antifraud falla código postal con riesgo elevado', async () => {
    test.fixme(true, 'PENDIENTE: tarjeta zip_fail_elevated — agregar a stripe-cards.ts');
  });
  test('[TS-STRIPE-TC1091] @regression @antifraud dirección no disponible', async () => {
    test.fixme(true, 'PENDIENTE: tarjeta address_unavailable — agregar a stripe-cards.ts');
  });

});
