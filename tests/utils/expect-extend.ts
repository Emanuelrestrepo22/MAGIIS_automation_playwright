/**
 * MAGIIS — Custom expect helpers por dominio (BL-040).
 *
 * Reemplaza timeouts mágicos sueltos en specs (`{ timeout: 30_000 }`, `{ timeout: 20_000 }`)
 * por helpers tipados que documentan la justificación del timeout en su nombre.
 *
 * Patrón de import recomendado:
 *
 *   import { expect, expect3DS, expectGatewaySettle } from 'tests/utils/expect-extend';
 *
 * NO usar más de un helper en la misma assertion; elegir el dominio que aplique.
 * Si ninguno aplica, usar el `expect` hard re-exportado al final del módulo.
 *
 * Referencia Playwright: https://playwright.dev/docs/test-assertions#expectconfigure
 */

import { expect } from '@playwright/test';

/**
 * expect3DS — assertions sobre modales 3DS bancarios.
 * Justificación: Stripe Elements iframe + redirect bancario pueden tardar 15-30s.
 * Reemplaza usos sueltos de { timeout: 30_000 } en specs Stripe.
 *
 * Uso típico:
 *   await expect3DS(threeDsModal.frame).toBeVisible();
 *   await expect3DS(challenge.completeButton).toBeEnabled();
 *
 * NO usar para assertions sobre DOM sincrónico de la app MAGIIS.
 */
export const expect3DS = expect.configure({ timeout: 30_000 });

/**
 * expectFast — assertions sobre DOM sincrónico (texto presente, atributo seteado).
 * Justificación: si el DOM tarda >2s en mostrar X, hay un bug, no es razón para esperar más.
 * Si necesitás más timeout, hay un smell de sincronización mal manejada — revisar antes que subir el timeout.
 */
export const expectFast = expect.configure({ timeout: 2_000 });

/**
 * expectGatewaySettle — assertions post-API gateway (confirmación creación viaje, hold settled, payment reference visible).
 * Justificación: típicamente 5-20s dependiendo del round-trip backend MAGIIS + gateway externo.
 * Cubre Stripe y Authorize.
 *
 * Uso típico:
 *   await expectGatewaySettle(travelManagement.searchingDriverStatus).toBeVisible();
 *   await expectGatewaySettle(detail.paymentReference).toContainText(/pi_/);
 */
export const expectGatewaySettle = expect.configure({ timeout: 20_000 });

/**
 * Re-export hard `expect` para evitar dos imports en el mismo spec.
 * Patrón: `import { expect, expect3DS, expectGatewaySettle } from 'tests/utils/expect-extend';`
 */
export { expect };
