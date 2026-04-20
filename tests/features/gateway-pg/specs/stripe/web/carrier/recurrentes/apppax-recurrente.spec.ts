/**
 * TCs: TS-STRIPE-P2-TC048–TC053
 * Feature: Viajes Recurrentes — Portal Carrier — Usuario App Pax
 * Tags: @regression @recurrente @web-only
 */
import { test } from '../../../../../../../TestBase';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe('Gateway PG · Carrier · App Pax — Viajes Recurrentes', () => {

  test('[TS-STRIPE-P2-TC048] @regression @recurrente @hold vinculación + recurrente hold+cobro app pax', async () => {
    test.fixme(true, 'PENDIENTE: Page Object RecurrentTravelPage no implementado');
  });
  test('[TS-STRIPE-P2-TC049] @regression @recurrente sin hold vinculación + recurrente app pax', async () => {
    test.fixme(true, 'PENDIENTE: depende de P2-TC048');
  });
  test('[TS-STRIPE-P2-TC050] @regression @recurrente @hold selección tarjeta + recurrente hold+cobro', async () => {
    test.fixme(true, 'PENDIENTE: depende de P2-TC048');
  });
  test('[TS-STRIPE-P2-TC051] @regression @recurrente sin hold selección tarjeta + recurrente', async () => {
    test.fixme(true, 'PENDIENTE: depende de P2-TC048');
  });
  test('[TS-STRIPE-P2-TC052] @regression @recurrente @3ds vinculación + recurrente hold+cobro 3DS', async () => {
    test.fixme(true, 'PENDIENTE: depende de P2-TC048');
  });
  test('[TS-STRIPE-P2-TC053] @regression @recurrente @3ds sin hold vinculación + recurrente 3DS', async () => {
    test.fixme(true, 'PENDIENTE: depende de P2-TC048');
  });

});
