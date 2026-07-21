/**
 * TCs: TS-STRIPE-TC1001 – TC1008
 * Feature: Configuración de Pasarela Stripe en Magiis App Store
 * Tags: @smoke @critical @web-only
 *
 * KATA conformance (feature/kata-conformance): specs de placeholder (fixme). test del
 * fixture KATA (@TestFixture). Sin ATC aún (no hay flujo implementado). Al implementar,
 * mapear al área CFG del idmap (MG-211+, Level UI) — PENDIENTE REASIGNAR.
 */
import { test } from '@TestFixture';

// El fixture KATA no define la opción `role` (login explícito en el flujo cuando se implemente).
test.use({ storageState: undefined });

test.describe('Gateway PG · Configuración Pasarela Stripe @gateway @stripe @wallet @regression', () => {

  test.describe('Visualización y estado inicial', () => {
    test('[TS-STRIPE-TC1001] @smoke @web-only visualizar pasarela Stripe no vinculada', async () => {
      // MG-178: POM scaffolded → CarrierGlobalIntegrationsPage (@ui/carrier), ruta /integrations, card "Stripe".
      test.fixme(true, 'MG-178 scaffolding: CarrierGlobalIntegrationsPage creado (expectUnlinked); validar estado inicial en vivo.');
    });
    test('[TS-STRIPE-TC1007] @regression persistencia estado vinculado tras recarga', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1002');
    });
  });

  test.describe('Vinculación con credenciales', () => {
    test('[TS-STRIPE-TC1002] @smoke @critical vincular Stripe con credenciales válidas', async () => {
      // MG-178 MISMATCH DE PRODUCTO: en el FE Stripe se vincula por OAuth redirect (sin formulario de
      // credenciales; eso aplica a Authorize.Net/EBizCharge). El callback ?code= externo no es
      // automatizable end-to-end. Este TC requiere REDISEÑO contra el flujo OAuth real.
      test.fixme(true, 'MG-178 product-mismatch: Stripe usa OAuth redirect, no credenciales. TC requiere rediseño (ver CarrierGlobalIntegrationsPage.startLink).');
    });
    test('[TS-STRIPE-TC1003] @regression impedir vinculación con credenciales inválidas', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1002');
    });
  });

  test.describe('Desvinculación', () => {
    test('[TS-STRIPE-TC1004] @regression cancelar popup de desvinculación sin ejecutar acción', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1002');
    });
    test('[TS-STRIPE-TC1005] @regression desvincular Stripe y ocultar método preautorizado', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1002');
    });
  });

  test.describe('Exclusividad de pasarela', () => {
    test('[TS-STRIPE-TC1006] @regression impedir vincular otro gateway con Stripe activo', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1002');
    });
  });

  test.describe('Validación de red', () => {
    test('[TS-STRIPE-TC1008] @regression request link/unlink retorna status 200', async () => {
      test.fixme(true, 'PENDIENTE: requiere interceptación de red o API helper');
    });
  });

});
