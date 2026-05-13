/**
 * Multi-gateway shared types — BL-024 Fase 3 (2026-05-13)
 * ========================================================
 *
 * Tipos transversales a todos los gateways de pago soportados por MAGIIS.
 *
 * Principio rector:
 *   "Comportamiento esperado constante, datos variables por gateway."
 *
 * Cada gateway define sus propios tipos específicos (`StripeTestCard`,
 * `AuthorizeTestCard`) con campos que sólo aplican a ese sandbox. Pero
 * cuando el código de orquestación necesita razonar sobre cualquier
 * tarjeta de manera genérica, usa `GenericTestCard` definido acá.
 */

/**
 * Gateways de pago soportados por MAGIIS.
 *
 * **Importante:** estos valores deben coincidir EXACTAMENTE con `PaymentGateway`
 * de `tests/features/gateway-pg/contracts/gateway-pg.types.ts`. Cualquier
 * divergencia rompe el mapeo con `helpers/adapters/index.ts`.
 *
 * Estado:
 *   - stripe       — producción activa, cobertura completa
 *   - authorize    — sandbox listo, runtime pendiente
 *   - mercado-pago — investigación pendiente (BL-026)
 *   - ebizcharge   — investigación pendiente (BL-027)
 */
export type GatewayName = 'stripe' | 'authorize' | 'mercado-pago' | 'ebizcharge';

/**
 * Intents canónicos cross-gateway.
 *
 * Cada gateway mapea estos intents conceptuales a una de sus tarjetas
 * concretas. Permite escribir specs polimórficos:
 *
 *   const card = resolveCard({ gateway, intent: 'HAPPY_AUTH' });
 *
 * Mapping conceptual:
 *   | Intent              | Stripe                     | Authorize          |
 *   |---------------------|----------------------------|--------------------|
 *   | HAPPY_NO_AUTH       | SUCCESS_NO_3DS (4242)      | SUCCESS (4111+900) |
 *   | HAPPY_AUTH          | HAPPY_3DS (3184)           | N/A (no 3DS)       |
 *   | FAIL_AUTH           | FAIL_3DS (9235)            | N/A (no 3DS)       |
 *   | DECLINE_AUTHORIZE   | DECLINE_AUTHORIZE (0002)   | DECLINE_GENERIC    |
 *   | DECLINE_CAPTURE     | DECLINE_CAPTURE (9995)     | N/A                |
 *   | DECLINE_INVALID_CVC | DECLINE_INVALID_CVC (0127) | DECLINE_CVV (901)  |
 *
 * Si un intent no aplica a un gateway, el resolver de ese gateway debe
 * lanzar con mensaje claro: "intent X no soportado por Y".
 */
export type CardIntent =
	| 'HAPPY_NO_AUTH'
	| 'HAPPY_AUTH'
	| 'FAIL_AUTH'
	| 'DECLINE_AUTHORIZE'
	| 'DECLINE_CAPTURE'
	| 'DECLINE_INVALID_CVC';

/**
 * Forma genérica de tarjeta para código de orquestación cross-gateway.
 *
 * Cada gateway define un tipo específico (StripeTestCard, AuthorizeTestCard)
 * con más detalle. Esta forma incluye sólo los campos comunes que cualquier
 * test puede consumir sin importar el gateway.
 *
 * Notas:
 *   - `expiry` es string en formato 'MM/YY' (consistente con UI Stripe Elements).
 *   - `zip` es opcional porque no todos los gateways lo usan en el form.
 *   - `expectedOutcome` es el resultado esperado declarado por el fixture, útil
 *     para que el spec sepa qué assertion validar sin recordar el mapping.
 *   - `requires3ds` indica si la card dispara challenge 3DS. Stripe puede
 *     hacerlo según number; Authorize nunca.
 */
export type GenericTestCard = {
	gateway: GatewayName;
	number: string;
	last4: string;
	expiry: string;
	cvc: string;
	holderName: string;
	zip?: string;
	expectedOutcome: string;
	requires3ds: boolean;
};

/**
 * Argumentos del resolver polimórfico cross-gateway.
 */
export type ResolveCardArgs = {
	gateway: GatewayName;
	intent: CardIntent;
};
