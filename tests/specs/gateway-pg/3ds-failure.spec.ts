/**
 * MAGIIS — GATEWAY Suite: Flujo 3DS Fallo + Reintento
 * Fuente: STRIPE_Test_Suite.xlsx / hoja: GATEWAY_3DS
 *
 * TCs cubiertos:
 *   TC03 — Fallo 3DS en alta de viaje on demand — reintento desde detalle
 *   TC04 — Fallo 3DS — cambio de tarjeta — hold exitoso
 *
 * Jira: MAGIIS-XXX
 * Componente: ModalThreeDSComponent (compartido)
 *
 * PRECONDICIÓN DE AMBIENTE:
 *   Ejecutar con --workers=1 para evitar colisiones en Stripe Test Mode.
 *   Script: pnpm test:test:gateway-pg:3ds
 */

import { test, expect } from '../../TestBase';
import { NewTravelPage }    from '../../pages/NewTravelPage';
import { TravelDetailPage } from '../../pages/TravelDetailPage';
import { ThreeDSModal }     from '../../pages/ThreeDSModal';
import { ErrorPopup }       from '../../pages/ErrorPopup';
import { STRIPE_TEST_CARDS } from '../../data/stripe-cards';

// Datos de prueba comunes
// TODO: mover a fixture o a un archivo de datos si se reutilizan entre suites
const TEST_PASSENGER = 'Juan Pérez Test';
const TEST_ORIGIN    = 'Av. Corrientes 1234, CABA';
const TEST_DEST      = 'Av. Santa Fe 5678, CABA';

test.describe('[GATEWAY] Flujo 3DS — Fallo y reintento @regression @stripe @3ds', () => {

  // Auth manejada por storageState del globalSetup — no se necesita login explícito
  test.use({ role: 'carrier' });

  // ─────────────────────────────────────────────────────────────────────────
  test.describe('[TC03] Fallo 3DS en alta de viaje on demand', () => {
    // Como dispatcher quiero ser informado cuando falla el 3DS
    // para poder reintentar o cambiar la tarjeta sin perder el viaje
    // UC: Alta de viaje on demand con tarjeta 3DS requerida — fallo

    test('TC03-validar-popup-error-al-fallar-3ds', async ({ page }) => {
      // Precondiciones:
      //   - Dispatcher logueado en portal Carrier (via storageState)
      //   - Pasajero con tarjeta 3DS vinculada (fail: 4000000000009235)
      //   - Viaje sin conductor asignado

      const travel  = new NewTravelPage(page);
      const threeDS = new ThreeDSModal(page);
      const popup   = new ErrorPopup(page);

      await test.step('[TC03][STEP-01] Navegar a alta de viaje', async () => {
        await travel.goto();
      });

      await test.step('[TC03][STEP-02] Completar datos del viaje', async () => {
        await travel.searchPassenger(TEST_PASSENGER);
        await travel.setOrigin(TEST_ORIGIN);
        await travel.setDestination(TEST_DEST);
      });

      await test.step('[TC03][STEP-03] Seleccionar tarjeta que genera 3DS con fallo', async () => {
        await travel.selectCard(STRIPE_TEST_CARDS.visa_3ds_fail.last4);
      });

      await test.step('[TC03][STEP-04] Crear viaje — el sistema ejecuta hold → requires_action', async () => {
        await travel.submit();
      });

      await test.step('[TC03][STEP-05] Esperar modal 3DS y completar con FALLO', async () => {
        await threeDS.waitForVisible();
        await threeDS.completeFail();
      });

      await test.step('[TC03][STEP-06] Debería mostrar pop-up de error informando fallo 3DS', async () => {
        await popup.waitForVisible();
        const msg = await popup.getMessage();
        // Debería contener referencia a autenticación o 3DS
        expect(msg).toMatch(/autenticaci[oó]n|3ds|seguridad/i);
      });
    });

    test('TC03-validar-redirect-a-detalle-al-aceptar-popup', async ({ page }) => {
      const travel  = new NewTravelPage(page);
      const threeDS = new ThreeDSModal(page);
      const popup   = new ErrorPopup(page);

      // Setup: generar estado fallo 3DS
      await travel.goto();
      await travel.searchPassenger(TEST_PASSENGER);
      await travel.setOrigin(TEST_ORIGIN);
      await travel.setDestination(TEST_DEST);
      await travel.selectCard(STRIPE_TEST_CARDS.visa_3ds_fail.last4);
      await travel.submit();
      await threeDS.waitForVisible();
      await threeDS.completeFail();
      await popup.waitForVisible();

      await test.step('[TC03][STEP-06] Aceptar el pop-up de error', async () => {
        await popup.accept();
      });

      await test.step('[TC03][STEP-07] Debería redirigir a la página de detalle del viaje', async () => {
        // Debería redirigir a detalle del viaje creado
        await expect(page).toHaveURL(/\/travels\/\w+/, { timeout: 15_000 });
      });
    });

    test('TC03-validar-red-flag-y-boton-reintento-en-detalle', async ({ page }) => {
      const travel  = new NewTravelPage(page);
      const threeDS = new ThreeDSModal(page);
      const popup   = new ErrorPopup(page);
      const detail  = new TravelDetailPage(page);

      // Setup: llegar al detalle en estado NO_AUTORIZADO
      await travel.goto();
      await travel.searchPassenger(TEST_PASSENGER);
      await travel.setOrigin(TEST_ORIGIN);
      await travel.setDestination(TEST_DEST);
      await travel.selectCard(STRIPE_TEST_CARDS.visa_3ds_fail.last4);
      await travel.submit();
      await threeDS.waitForVisible();
      await threeDS.completeFail();
      await popup.waitForVisible();
      await popup.accept();
      await page.waitForURL(/\/travels\/\w+/, { timeout: 15_000 });

      await test.step('[TC03][STEP-08] Debería mostrar estado NO_AUTORIZADO', async () => {
        const statusBadge = await detail.getTravelStatus();
        // Debería mostrar el estado del viaje como No autorizado
        await expect(statusBadge).toContainText('No autorizado', { timeout: 10_000 });
      });

      await test.step('[TC03][STEP-09] Debería mostrar red flag de 3DS pendiente', async () => {
        const redFlag = await detail.get3DSRedFlag();
        // Debería mostrar red flag en sección forma de pago indicando 3DS pendiente
        await expect(redFlag).toBeVisible();
      });

      await test.step('[TC03][STEP-10] Debería mostrar botón "Reintentar autenticación"', async () => {
        const retryBtn = await detail.getRetryButton();
        // Debería mostrar botón de reintento disponible para el dispatcher
        await expect(retryBtn).toBeVisible();
      });
    });

    test('TC03-validar-reintento-exitoso-cambia-estado-a-searching-driver', async ({ page }) => {
      const travel  = new NewTravelPage(page);
      const threeDS = new ThreeDSModal(page);
      const popup   = new ErrorPopup(page);
      const detail  = new TravelDetailPage(page);

      // Setup: generar viaje en estado NO_AUTORIZADO
      await travel.goto();
      await travel.searchPassenger(TEST_PASSENGER);
      await travel.setOrigin(TEST_ORIGIN);
      await travel.setDestination(TEST_DEST);
      await travel.selectCard(STRIPE_TEST_CARDS.visa_3ds_fail.last4);
      await travel.submit();
      await threeDS.waitForVisible();
      await threeDS.completeFail();
      await popup.waitForVisible();
      await popup.accept();
      await page.waitForURL(/\/travels\/\w+/, { timeout: 15_000 });

      await test.step('[TC03][STEP-11] Reintentar autenticación 3DS', async () => {
        await detail.clickRetry();
        // Debería relanzar el modal 3DS
        await threeDS.waitForVisible();
        // Completar con éxito esta vez
        await threeDS.completeSuccess();
        await threeDS.waitForHidden();
      });

      await test.step('[TC03][STEP-12] Debería actualizar estado a SEARCHING_DRIVER', async () => {
        const statusBadge = await detail.getTravelStatus();
        // Debería actualizar el estado del viaje a Buscando conductor
        await expect(statusBadge).toContainText('Buscando conductor', { timeout: 15_000 });
      });

      await test.step('[TC03][STEP-13] Debería desaparecer el red flag de 3DS', async () => {
        const redFlag = await detail.get3DSRedFlag();
        // Debería desaparecer el indicador de 3DS pendiente
        await expect(redFlag).toBeHidden();
      });

      // DB TODO: SELECT status FROM travels WHERE id = <travel_id>
      //          EXPECTED: status = 'SEARCHING_DRIVER'
      // DB TODO: SELECT status FROM payments WHERE travel_id = <travel_id>
      //          EXPECTED: status = 'AUTHORIZED'
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  test.describe('[TC04] Fallo 3DS — cambio de tarjeta — hold exitoso', () => {
    // Como dispatcher quiero poder cambiar la tarjeta cuando falla el 3DS
    // para completar el viaje con otro medio de pago
    // UC: Alta de viaje — cambio de tarjeta post fallo 3DS

    test('TC04-validar-cambio-de-tarjeta-post-fallo-3ds', async ({ page }) => {
      const travel  = new NewTravelPage(page);
      const threeDS = new ThreeDSModal(page);
      const popup   = new ErrorPopup(page);
      const detail  = new TravelDetailPage(page);

      // Setup: generar viaje en estado NO_AUTORIZADO (mismo flujo que TC03)
      await travel.goto();
      await travel.searchPassenger(TEST_PASSENGER);
      await travel.setOrigin(TEST_ORIGIN);
      await travel.setDestination(TEST_DEST);
      await travel.selectCard(STRIPE_TEST_CARDS.visa_3ds_fail.last4);
      await travel.submit();
      await threeDS.waitForVisible();
      await threeDS.completeFail();
      await popup.waitForVisible();
      await popup.accept();
      await page.waitForURL(/\/travels\/\w+/, { timeout: 15_000 });

      await test.step('[TC04][STEP-05] Seleccionar otra tarjeta (sin 3DS requerido)', async () => {
        // TODO: implementar TravelDetailPage.changeCard() cuando los selectores estén validados
        // await detail.changeCard(STRIPE_TEST_CARDS.visa_success.last4);
        test.fixme(true, 'TC04 pendiente: TravelDetailPage.changeCard() requiere validación de selectores DOM');
      });

      await test.step('[TC04][STEP-06] Debería ejecutar hold con nueva tarjeta y cambiar estado', async () => {
        // TODO: assertion sobre nuevo estado
        // await expect(await detail.getTravelStatus()).toContainText('Buscando conductor');
      });

      // DB TODO: SELECT payment_method, status FROM payments WHERE travel_id = <travel_id>
      //          EXPECTED: nueva tarjeta (visa_success), status = 'AUTHORIZED'
    });
  });

});
