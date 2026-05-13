/**
 * Re-export legacy + `TEST_DATA` de dominio (temporal — Fase 2 lo extrae).
 *
 * BL-024 Fase 1 (2026-05-13) — invertida la dirección de dependencia.
 * Los exports Stripe vienen de `tests/fixtures/stripe/cards` (SoT real).
 * El bloque `TEST_DATA` (datos de dominio MAGIIS: client, passenger, origin,
 * destination) queda acá por ahora — Fase 2 lo moverá a un archivo neutro
 * `data/journey-defaults.ts` para que sea reutilizable por todos los gateways.
 */

// Stripe-specific (env-aware) — vienen de la SoT real.
export {
	STRIPE_TEST_CARDS,
	STRIPE_EXPIRY,
	STRIPE_CVC,
	STRIPE_BILLING_ZIP,
	STRIPE_CARD_HOLDER_NAME,
} from '../../../fixtures/stripe/cards';

import { PASSENGERS } from './passengers';

/**
 * Datos de dominio MAGIIS — agnósticos del gateway de pago.
 *
 * TODO BL-024 Fase 2: mover a `tests/features/gateway-pg/data/journey-defaults.ts`
 * para que tests Authorize, MercadoPago, etc. los reutilicen sin importar
 * un archivo Stripe-named.
 */
export const TEST_DATA = {
	// Default carrier flow: el cliente auto-completa el pasajero y deja "Regular" listo.
	client: PASSENGERS.empresaIndividuo.name,
	passenger: PASSENGERS.appPax.name,
	// Contractor: cliente 'fast car', pasajero = colaborador CON tarjeta 4242 activa.
	contractorClient: 'fast car',
	contractorPassenger: PASSENGERS.colaborador.name,
	contractorColaborador: PASSENGERS.colaborador.name,
	contractorPassengerSinTarjeta: PASSENGERS.colaboradorSinTarjeta.name,
	appPaxPassenger: PASSENGERS.appPax.name,
	origin: 'Reconquista 661, Buenos Aires, Argentina',
	destination: 'Cazadores 1987, Buenos Aires, Argentina',
} as const;
