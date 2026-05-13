/**
 * Barrel — POMs Stripe-specific del portal Carrier.
 *
 * Estos POMs modelan elementos del SDK Stripe (iframe 3DS challenge,
 * popups de error post-3DS). NO aplican a otros gateways.
 *
 * Para imports nuevos, preferir:
 *
 *   import { ThreeDSModal } from 'tests/pages/carrier/stripe';
 *
 * El barrel global `pages/carrier/index.ts` re-exporta estos POMs por
 * compatibilidad con imports legacy (`from '../../pages/carrier'`).
 */

export { ThreeDSModal } from './ThreeDSModal';
export { ThreeDSErrorPopup } from './ThreeDSErrorPopup';
