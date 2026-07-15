import type { Page } from '@playwright/test';
import { ErrorPopup as SharedErrorPopup } from '../../../pages/carrier/ErrorPopup';

/**
 * Stripe 3DS Error Popup — POM propio de la feature gateway-pg.
 *
 * Modela el popup de error 3DS específico del flujo Stripe (extiende el
 * `ErrorPopup` genérico compartido de MAGIIS sin alterar comportamiento).
 *
 * Reubicado a `features/gateway-pg/pages/` en 2026-07-14 (encapsulación Fase B).
 * `ErrorPopup` permanece como primitiva compartida en `pages/carrier/`.
 */
export class ThreeDSErrorPopup extends SharedErrorPopup {
  constructor(page: Page) {
    super(page);
  }
}
