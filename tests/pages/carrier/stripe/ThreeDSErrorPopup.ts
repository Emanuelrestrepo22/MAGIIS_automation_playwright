import type { Page } from '@playwright/test';
import { ErrorPopup as SharedErrorPopup } from '../ErrorPopup';

/**
 * Stripe 3DS Error Popup — POM Stripe-specific.
 *
 * Modela el popup de error 3DS específico del flujo Stripe (extiende el
 * `ErrorPopup` genérico de MAGIIS sin alterar comportamiento).
 *
 * Movido desde `pages/carrier/ThreeDSErrorPopup.ts` en 2026-05-13.
 */
export class ThreeDSErrorPopup extends SharedErrorPopup {
  constructor(page: Page) {
    super(page);
  }
}
