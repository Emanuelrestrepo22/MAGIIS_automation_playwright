/**
 * TCs: TS-STRIPE-TC1065–TC1068, TC1073–TC1076
 * Feature: Alta de Viaje desde Carrier — Usuario Empresa Individuo — sin 3DS
 * Tags: @regression @hold @web-only
 */
import { test } from '../../../../../TestBase';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe('Gateway PG · Carrier · Empresa Individuo — Hold sin 3DS', () => {

  test.describe('Hold ON', () => {
    test('[TS-STRIPE-TC1065] @smoke @hold hold+cobro empresa sin 3DS', async () => {
      test.fixme(true, 'PENDIENTE: tarjeta successDirect, usuario empresa individuo TEST');
    });
    test('[TS-STRIPE-TC1067] @regression @hold hold+cobro empresa sin 3DS variante', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1065');
    });
    test('[TS-STRIPE-TC1073] @regression @hold hold+cobro empresa sin 3DS (set 2)', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1065');
    });
    test('[TS-STRIPE-TC1075] @regression @hold hold+cobro empresa sin 3DS variante 2', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1065');
    });
  });

  test.describe('Hold OFF', () => {
    test('[TS-STRIPE-TC1066] @regression sin hold empresa sin 3DS', async () => {
      test.fixme(true, 'PENDIENTE: requiere Hold OFF');
    });
    test('[TS-STRIPE-TC1068] @regression sin hold empresa sin 3DS variante', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1066');
    });
    test('[TS-STRIPE-TC1074] @regression sin hold empresa sin 3DS (set 2)', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1066');
    });
    test('[TS-STRIPE-TC1076] @regression sin hold empresa sin 3DS variante 2', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1066');
    });
  });

});
