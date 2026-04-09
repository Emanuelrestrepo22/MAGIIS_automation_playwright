/**
 * TCs: TS-STRIPE-TC1069–TC1072, TC1077–TC1080
 * Feature: Alta de Viaje desde Carrier — Usuario Empresa Individuo — con 3DS
 * Tags: @critical @3ds @hold @web-only
 */
import { test } from '../../../../../../TestBase';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe('Gateway PG · Carrier · Empresa Individuo — Hold con 3DS', () => {

  test.describe('Hold ON', () => {
    test('[TS-STRIPE-TC1069] @critical @3ds @hold hold+cobro empresa 3DS success', async () => {
      test.fixme(true, 'PENDIENTE: requiere usuario empresa individuo en TEST');
    });
    test('[TS-STRIPE-TC1071] @regression @3ds @hold hold+cobro empresa 3DS variante', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1069');
    });
    test('[TS-STRIPE-TC1077] @regression @3ds @hold hold+cobro empresa 3DS (set 2)', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1069');
    });
    test('[TS-STRIPE-TC1079] @regression @3ds @hold hold+cobro empresa 3DS variante 2', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1069');
    });
  });

  test.describe('Hold OFF', () => {
    test('[TS-STRIPE-TC1070] @regression @3ds sin hold empresa 3DS', async () => {
      test.fixme(true, 'PENDIENTE: requiere Hold OFF');
    });
    test('[TS-STRIPE-TC1072] @regression @3ds sin hold empresa 3DS variante', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1070');
    });
    test('[TS-STRIPE-TC1078] @regression @3ds sin hold empresa 3DS (set 2)', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1070');
    });
    test('[TS-STRIPE-TC1080] @regression @3ds sin hold empresa 3DS variante 2', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1070');
    });
  });

});
