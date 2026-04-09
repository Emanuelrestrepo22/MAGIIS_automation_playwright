/**
 * TCs: TS-STRIPE-TC1013–TC1016
 * Feature: E2E Alta de Viaje App Pax Personal — Tarjeta Preautorizada con 3DS
 * Runner: Playwright (fase web) + Appium (fase mobile)
 * Tags: @mobile @3ds @hold @critical
 */
import { test } from '../../../../../TestBase';

test.describe('Gateway PG · E2E Mobile · App Pax Personal — Hold con 3DS', () => {

  test.fixme(true, 'BLOQUEADO: requiere Appium Server + App Driver + App Pax instaladas y configuradas');

  test('[TS-STRIPE-TC1013] @critical @mobile @3ds @hold E2E hold+cobro app pax personal 3DS', async () => {
    // Fase web (Playwright): carrier crea viaje con tarjeta 3DS
    // Fase mobile (Appium): driver acepta y finaliza el viaje → cobro
  });
  test('[TS-STRIPE-TC1014] @regression @mobile @3ds sin hold E2E app pax personal 3DS', async () => {
    // Hold OFF — viaje finaliza sin cobro
  });
  test('[TS-STRIPE-TC1015] @regression @mobile @3ds @hold E2E hold+cobro app pax personal 3DS variante', async () => {
    // Variante de TC1013
  });
  test('[TS-STRIPE-TC1016] @regression @mobile @3ds sin hold E2E app pax personal 3DS variante', async () => {
    // Variante de TC1014
  });

});
