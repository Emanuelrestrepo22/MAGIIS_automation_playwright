/**
 * @deprecated Re-export legacy — la SoT real vive en `pages/carrier/stripe/ThreeDSModal.ts`.
 *
 * Movido en 2026-05-13 (organización multi-gateway). Authorize.net NO usa 3DS,
 * por lo que este POM es Stripe-specific y vive bajo el subdirectorio `stripe/`.
 *
 * Nuevos archivos deben importar desde `tests/pages/carrier/stripe/`.
 */
export { ThreeDSModal } from './stripe/ThreeDSModal';
