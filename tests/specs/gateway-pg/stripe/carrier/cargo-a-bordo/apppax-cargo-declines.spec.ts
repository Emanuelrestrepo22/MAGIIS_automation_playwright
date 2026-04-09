/**
 * TCs: TS-STRIPE-TC1082–TC1086
 * Feature: Cargo a Bordo — Tarjeta de Crédito — Usuario App Pax — Rechazos y errores
 * Tags: @regression @cargo-a-bordo @web-only
 */
import { test } from '../../../../../TestBase';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe('Gateway PG · Carrier · App Pax — Cargo a Bordo · Declines', () => {

  test('[TS-STRIPE-TC1082] @regression @cargo-a-bordo pago rechazado genérico', async () => {
    test.fixme(true, 'PENDIENTE: tarjeta declined_generic');
  });
  test('[TS-STRIPE-TC1083] @regression @cargo-a-bordo fondos insuficientes', async () => {
    test.fixme(true, 'PENDIENTE: tarjeta declined_funds');
  });
  test('[TS-STRIPE-TC1084] @regression @cargo-a-bordo tarjeta reportada como perdida', async () => {
    test.fixme(true, 'PENDIENTE: tarjeta lost_card — agregar a stripe-cards.ts');
  });
  test('[TS-STRIPE-TC1085] @regression @cargo-a-bordo CVC incorrecto', async () => {
    test.fixme(true, 'PENDIENTE: tarjeta incorrect_cvc — agregar a stripe-cards.ts');
  });
  test('[TS-STRIPE-TC1086] @regression @cargo-a-bordo tarjeta robada', async () => {
    test.fixme(true, 'PENDIENTE: tarjeta stolen_card — agregar a stripe-cards.ts');
  });

});
