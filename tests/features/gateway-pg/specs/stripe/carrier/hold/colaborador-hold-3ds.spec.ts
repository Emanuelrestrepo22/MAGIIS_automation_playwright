/**
 * TCs: TS-STRIPE-TC1037–TC1040, TC1045–TC1048
 * Feature: Alta de Viaje desde Carrier — Usuario Colaborador/Asociado Contractor — con 3DS
 * Tags: @critical @3ds @hold @web-only
 */
import { test } from '../../../../../../TestBase';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe('Gateway PG · Carrier · Colaborador — Hold con 3DS', () => {

  test.describe('Hold ON', () => {
    test('[TS-STRIPE-TC1037] @critical @3ds @hold hold+cobro colaborador 3DS success', async () => {
      test.fixme(true, 'PENDIENTE: requiere usuario colaborador en TEST');
    });
    test('[TS-STRIPE-TC1039] @regression @3ds @hold hold+cobro colaborador 3DS variante', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1037');
    });
    test('[TS-STRIPE-TC1045] @regression @3ds @hold hold+cobro colaborador 3DS (set 2)', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1037');
    });
    test('[TS-STRIPE-TC1047] @regression @3ds @hold hold+cobro colaborador 3DS variante 2', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1037');
    });
  });

  test.describe('Hold OFF', () => {
    test('[TS-STRIPE-TC1038] @regression @3ds sin hold colaborador 3DS', async () => {
      test.fixme(true, 'PENDIENTE: requiere Hold OFF');
    });
    test('[TS-STRIPE-TC1040] @regression @3ds sin hold colaborador 3DS variante', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1038');
    });
    test('[TS-STRIPE-TC1046] @regression @3ds sin hold colaborador 3DS (set 2)', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1038');
    });
    test('[TS-STRIPE-TC1048] @regression @3ds sin hold colaborador 3DS variante 2', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1038');
    });
  });

});
