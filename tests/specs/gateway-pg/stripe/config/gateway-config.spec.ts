/**
 * TCs: TS-STRIPE-TC1001 – TC1008
 * Feature: Configuración de Pasarela Stripe en Magiis App Store
 * Tags: @smoke @critical @web-only
 */
import { test } from '../../../../TestBase';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe('Gateway PG · Configuración Pasarela Stripe', () => {

  test.describe('Visualización y estado inicial', () => {
    test('[TS-STRIPE-TC1001] @smoke @web-only visualizar pasarela Stripe no vinculada', async () => {
      test.fixme(true, 'PENDIENTE: Page Object GatewayConfigPage no implementado');
    });
    test('[TS-STRIPE-TC1007] @regression persistencia estado vinculado tras recarga', async () => {
      test.fixme(true, 'PENDIENTE: depende de TC1002');
    });
  });

  test.describe('Vinculación con credenciales', () => {
    test('[TS-STRIPE-TC1002] @smoke @critical vincular Stripe con credenciales válidas', async () => {
      test.fixme(true, 'PENDIENTE: requiere credenciales Stripe App Store en .env');
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
