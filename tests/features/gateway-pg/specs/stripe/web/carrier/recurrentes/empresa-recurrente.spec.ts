/**
 * TCs: TS-STRIPE-P2-TC054–TC059
 * Feature: Viajes Recurrentes — Portal Carrier — Usuario Empresa Individuo
 * Tags: @regression @recurrente @web-only
 */
import { test } from '../../../../../../../TestBase';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe('Gateway PG · Carrier · Empresa Individuo — Viajes Recurrentes', () => {

  test('[TS-STRIPE-P2-TC054] @regression @recurrente @hold vinculación + recurrente hold+cobro empresa', async () => {
    test.fixme(true, 'PENDIENTE: Page Object RecurrentTravelPage no implementado');
  });
  test('[TS-STRIPE-P2-TC055] @regression @recurrente sin hold vinculación + recurrente empresa', async () => {
    test.fixme(true, 'PENDIENTE: depende de P2-TC054');
  });
  test('[TS-STRIPE-P2-TC056] @regression @recurrente @hold selección tarjeta + recurrente hold+cobro', async () => {
    test.fixme(true, 'PENDIENTE: depende de P2-TC054');
  });
  test('[TS-STRIPE-P2-TC057] @regression @recurrente sin hold selección tarjeta + recurrente', async () => {
    test.fixme(true, 'PENDIENTE: depende de P2-TC054');
  });
  test('[TS-STRIPE-P2-TC058] @regression @recurrente @3ds vinculación + recurrente hold+cobro 3DS', async () => {
    test.fixme(true, 'PENDIENTE: depende de P2-TC054');
  });
  test('[TS-STRIPE-P2-TC059] @regression @recurrente @3ds sin hold vinculación + recurrente 3DS', async () => {
    test.fixme(true, 'PENDIENTE: depende de P2-TC054');
  });

});
