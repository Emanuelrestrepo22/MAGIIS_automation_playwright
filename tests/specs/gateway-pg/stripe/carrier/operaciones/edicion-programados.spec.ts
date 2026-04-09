/**
 * TCs: TS-STRIPE-P2-TC078–TC083
 * Feature: Edición de Viajes Programados — Carrier — Empresa Individuo
 * Tags: @regression @web-only
 */
import { test } from '../../../../../TestBase';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe('Gateway PG · Carrier · Empresa Individuo — Edición de Viajes Programados', () => {

  test.describe('Sin 3DS', () => {
    test('[TS-STRIPE-P2-TC078] @regression @hold alta + edición hold+cobro', async () => {
      test.fixme(true, 'PENDIENTE: requiere flujo de edición de viaje programado');
    });
    test('[TS-STRIPE-P2-TC079] @regression sin hold alta + edición', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC078');
    });
    test('[TS-STRIPE-P2-TC080] @regression @hold alta + edición hold+cobro variante', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC078');
    });
    test('[TS-STRIPE-P2-TC081] @regression sin hold alta + edición variante', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC078');
    });
  });

  test.describe('Con 3DS', () => {
    test('[TS-STRIPE-P2-TC082] @regression @3ds @hold clonación finalizado hold+cobro 3DS', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC078');
    });
    test('[TS-STRIPE-P2-TC083] @regression @3ds sin hold clonación finalizado 3DS', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC078');
    });
  });

});
