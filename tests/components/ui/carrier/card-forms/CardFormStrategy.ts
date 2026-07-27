/**
 * KATA Component (Layer 3) — Carrier · Card Form Strategy (contrato).
 *
 * Seam S3 (carrier/gateway-standardization): el alta de tarjeta pre-autorizada del
 * carrier tiene DOS formularios según la pasarela activa:
 *   - 'stripe-elements': 3 iframes de Stripe Elements (cardNumber/cardExpiry/cardCvc)
 *     + holder/ZIP nativos → `StripeElementsCardForm`.
 *   - 'native-angular':   form Angular nativo de MAGIIS compartido por Mercado Pago /
 *     Authorize.Net / eBizCharge (creditCardNumber, expiryDate, creditCardCVV,
 *     creditCardOwnerName + 5° campo variable) → `NativeAngularCardForm`.
 *
 * Contrato común (mismo pre/post que los helpers históricos):
 *   - PRECONDICIÓN: el método de pago ya está en "Preautorizada"
 *     (`NewTravelPage.selectPaymentMethod('Preautorizada')` o equivalente) y el form
 *     de tarjeta está renderizado/montándose.
 *   - `fill()` SOLO completa el formulario. NO hace click en "Validar" — el caller
 *     controla la validación (`clickValidateCard()` / `clickValidateCardAllowingReject()`).
 *
 * La selección de estrategia por pasarela vive en `cardFormFor(gateway)` (index.ts),
 * gobernada por `adapter.cardForm` / `adapter.nativeExtraField`
 * (tests/features/gateway-pg/helpers/adapters).
 */

import type { Page } from '@playwright/test';
import type { GenericTestCard } from '@fixtures/gateways/_shared';

/**
 * Datos mínimos que una estrategia necesita para completar el form.
 * Subconjunto estructural de `GenericTestCard` — cualquier tarjeta del resolver
 * cross-gateway (`resolveCard({ gateway, intent })`) es asignable tal cual.
 */
export type CardFormFillInput = Pick<GenericTestCard, 'number' | 'expiry' | 'cvc' | 'holderName' | 'zip'> & {
	/** Solo form nativo con 5° campo 'document' (Mercado Pago). Default 'DNI'. */
	docType?: string;
	/** Solo form nativo con 5° campo 'document' (Mercado Pago). Default '12345678'. */
	docNumber?: string;
};

/** Tipo de form que implementa la estrategia (espejo de `adapter.cardForm`). */
export type CardFormKind = 'stripe-elements' | 'native-angular';

/**
 * Estrategia de llenado del form de tarjeta pre-autorizada.
 * Recibe `page` como parámetro (NO extiende UiBase) para que tanto los componentes
 * KATA como los POMs legacy (`NewTravelPageBase`) puedan delegar sin re-instanciar
 * el contexto. Locators INLINE en cada estrategia (regla KATA — nunca en factories).
 */
export interface CardFormStrategy {
	readonly kind: CardFormKind;
	fill(page: Page, card: CardFormFillInput): Promise<void>;
}
