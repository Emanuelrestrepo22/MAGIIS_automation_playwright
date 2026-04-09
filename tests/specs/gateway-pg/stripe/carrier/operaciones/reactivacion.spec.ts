/**
 * TCs: TS-STRIPE-P2-TC060–TC065
 * Feature: Reactivación de Viajes Cancelados — Carrier — Empresa Individuo
 * Tags: @regression @web-only
 */
import { test } from '../../../../../TestBase';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe('Gateway PG · Carrier · Empresa Individuo — Reactivación de Viajes', () => {

  test.describe('Sin 3DS', () => {
    test('[TS-STRIPE-P2-TC060] @regression @hold reactivación cancelado hold+cobro', async () => {
      test.fixme(true, 'PENDIENTE: requiere viaje cancelado previo en TEST');
    });
    test('[TS-STRIPE-P2-TC061] @regression sin hold reactivación cancelado', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC060');
    });
    test('[TS-STRIPE-P2-TC062] @regression @hold reactivación cancelado hold+cobro variante', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC060');
    });
    test('[TS-STRIPE-P2-TC063] @regression sin hold reactivación cancelado variante', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC060');
    });
  });

  test.describe('Con 3DS', () => {
    test('[TS-STRIPE-P2-TC064] @regression @3ds @hold reactivación cancelado hold+cobro 3DS', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC060');
    });
    test('[TS-STRIPE-P2-TC065] @regression @3ds sin hold reactivación cancelado 3DS', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC060');
    });
  });

});
