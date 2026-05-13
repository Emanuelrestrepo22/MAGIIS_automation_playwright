/**
 * @deprecated Re-export legacy — los helpers reales viven en archivos separados:
 *
 *   - `journey-url.helpers.ts` (gateway-agnostic: waitForTravelCreation, extractTravelIdFromUrl)
 *   - `stripe/recovery.helpers.ts` (Stripe-specific: setupTravelWithFailed3DS)
 *
 * Movido en 2026-05-13 (organización multi-gateway). Nuevos archivos deben
 * importar directamente desde los paths canónicos, no desde aquí.
 *
 * Conservado para no romper imports en specs y POMs existentes.
 */

export { waitForTravelCreation, extractTravelIdFromUrl } from './journey-url.helpers';
export { setupTravelWithFailed3DS } from './stripe/recovery.helpers';
