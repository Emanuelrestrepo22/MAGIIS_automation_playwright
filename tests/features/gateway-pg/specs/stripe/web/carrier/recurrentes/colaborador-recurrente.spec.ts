/**
 * TCs: TS-STRIPE-P2-TC041–TC047
 * Feature: Viajes Recurrentes — Portal Carrier — Usuario Colaboradores
 * Tags: @regression @recurrente @web-only
 * Nota: TC047 marcado como CASO CRÍTICO en la fuente
 *
 * KATA conformance (feature/kata-conformance): specs de placeholder (fixme). test del
 * fixture KATA (@TestFixture). Sin ATC aún (no hay flujo implementado). Al implementar,
 * mapear al área REC del idmap (MG-390+, Level UI) — mapeo por área aceptado.
 */
import { test } from '@TestFixture';

// El fixture KATA no define la opción `role` (login explícito en el flujo cuando se implemente).
test.use({ storageState: undefined });

test.describe('Gateway PG · Carrier · Colaborador — Viajes Recurrentes @gateway @stripe @hold @wallet @regression', { annotation: [{ type: 'tms', description: 'MG-390' }] }, () => {

  test.describe('Vinculación de tarjeta', () => {
    test('[TS-STRIPE-P2-TC041] @regression @recurrente @hold vinculación + recurrente hold+cobro', async () => {
      test.fixme(true, 'PENDIENTE: Page Object RecurrentTravelPage no implementado');
    });
    test('[TS-STRIPE-P2-TC042] @regression @recurrente sin hold vinculación + recurrente', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC041');
    });
    test('[TS-STRIPE-P2-TC045] @regression @recurrente @3ds vinculación + recurrente hold+cobro 3DS', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC041');
    });
    test('[TS-STRIPE-P2-TC046] @regression @recurrente @3ds sin hold vinculación + recurrente 3DS', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC041');
    });
  });

  test.describe('Selección de tarjeta existente', () => {
    test('[TS-STRIPE-P2-TC043] @regression @recurrente @hold selección tarjeta + recurrente hold+cobro', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC041');
    });
    test('[TS-STRIPE-P2-TC044] @regression @recurrente sin hold selección tarjeta + recurrente', async () => {
      test.fixme(true, 'PENDIENTE: depende de P2-TC041');
    });
  });

  test.describe('Edición de fechas — CASO CRÍTICO', () => {
    test('[TS-STRIPE-P2-TC047] @critical @recurrente @3ds edición de fechas — validar consistencia y cobro', async () => {
      test.fixme(true, 'PENDIENTE CRÍTICO: requiere flujo completo recurrente + edición + App Driver');
    });
  });

});
