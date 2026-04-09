/**
 * TCs: TS-STRIPE-TC1033–TC1036, TC1041–TC1044
 * Feature: Alta de Viaje desde Carrier — Usuario Colaborador/Asociado Contractor — sin 3DS
 * Tags: @regression @hold @web-only
 */
import { test } from '../../../../../TestBase';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe('Gateway PG · Carrier · Colaborador — Hold sin 3DS', () => {

  test.describe('Hold ON', () => {
    test('[TS-STRIPE-TC1033] @smoke @hold hold+cobro colaborador sin 3DS', async () => {
      test.fixme(true, 'PENDIENTE: tarjeta successDirect, usuario colaborador TEST');
    });
    test('[TS-STRIPE-TC1035] @regression @hold hold+cobro colaborador sin 3DS variante', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1033');
    });
    test('[TS-STRIPE-TC1041] @regression @hold hold+cobro colaborador sin 3DS (set 2)', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1033');
    });
    test('[TS-STRIPE-TC1043] @regression @hold hold+cobro colaborador sin 3DS variante 2', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1033');
    });
  });

  test.describe('Hold OFF', () => {
    test('[TS-STRIPE-TC1034] @regression sin hold colaborador sin 3DS', async () => {
      test.fixme(true, 'PENDIENTE: requiere Hold OFF');
    });
    test('[TS-STRIPE-TC1036] @regression sin hold colaborador sin 3DS variante', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1034');
    });
    test('[TS-STRIPE-TC1042] @regression sin hold colaborador sin 3DS (set 2)', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1034');
    });
    test('[TS-STRIPE-TC1044] @regression sin hold colaborador sin 3DS variante 2', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1034');
    });
  });

});
