/**
 * Journey Defaults — Datos de dominio MAGIIS agnósticos del gateway de pago.
 * ===========================================================================
 *
 * BL-024 Fase 2 (2026-05-13) — separa datos transversales (clientes, pasajeros,
 * origin, destination) de los datos específicos del gateway (cards, CVCs, ZIPs
 * de trigger). Este archivo es la fuente neutral que consumen todos los
 * journeys del feature `gateway-pg`, sin importar qué pasarela ejerciten.
 *
 * Principio rector:
 *   "El comportamiento esperado del sistema es constante; sólo los datos de
 *    entrada cambian por pasarela. Las assertions de UI, los estados de
 *    viaje (SEARCHING_DRIVER, NO_AUTORIZADO, FINALIZADO), las grillas y los
 *    popups son MAGIIS — no del gateway."
 *
 * Qué vive ACÁ:
 *   - Default client / passenger por contexto (carrier directo, contractor,
 *     appPax, empresa).
 *   - Origin / destination canónicos para tests de happy path.
 *
 * Qué NO vive acá (vive en `tests/fixtures/gateways/<gateway>/`):
 *   - Números de tarjeta y triggers (Stripe number-based, Authorize CVV/ZIP-based).
 *   - Constantes de form específicas (STRIPE_EXPIRY, AUTHORIZE_DEFAULT_EXPIRY).
 *   - Selectors o eventos del SDK del gateway.
 *
 * Compatibilidad:
 *   - `tests/features/gateway-pg/data/stripeTestData.ts` re-exporta `TEST_DATA`
 *     desde este archivo (alias legacy mientras los specs migran).
 */

import type { GatewayName } from '@fixtures/gateways/_shared';

import { PASSENGERS } from './passengers';

/**
 * Defaults de journey neutros — usados por todos los tests del feature
 * gateway-pg sin importar el gateway de pago vinculado.
 */
export const JOURNEY_DEFAULTS = {
	// Default carrier flow: el cliente auto-completa el pasajero y deja "Regular" listo.
	client: PASSENGERS.empresaIndividuo.name,
	passenger: PASSENGERS.appPax.name,
	// Contractor: cliente 'fast car', pasajero = colaborador CON tarjeta 4242 activa.
	// PASSENGERS.colaborador = 'smith, Emanuel' (Emanuel Smith — tarjeta 4242 ✅)
	contractorClient: 'fast car',
	contractorPassenger: PASSENGERS.colaborador.name, // 'smith, Emanuel' — tiene tarjeta 4242
	// Alias explícito para el colaborador con tarjeta (mismo valor que contractorPassenger).
	contractorColaborador: PASSENGERS.colaborador.name, // 'smith, Emanuel'
	// Colaborador sin tarjeta activa — no usar en tests hold hasta que Admin vincule tarjeta.
	contractorPassengerSinTarjeta: PASSENGERS.colaboradorSinTarjeta.name, // 'Nayla Smith'
	appPaxPassenger: PASSENGERS.appPax.name,
	origin: 'Reconquista 661, Buenos Aires, Argentina',
	destination: 'Cazadores 1987, Buenos Aires, Argentina'
} as const;

/**
 * Shape de los journey defaults — lo referencian los adapters (`journeyDefaults`).
 * Seam S8 (carrier/gateway-standardization): ENSANCHADO a `string` (antes
 * `typeof JOURNEY_DEFAULTS`, cuyos literales `as const` impedían que una entrada
 * por pasarela sobreescribiera valores — ver `JOURNEY_DEFAULTS_BY_GATEWAY`).
 */
export type JourneyDefaults = { readonly [K in keyof typeof JOURNEY_DEFAULTS]: string };

/**
 * Defaults de journey POR PASARELA (S8) — mismos campos que `JourneyDefaults` más los
 * datos de dominio que hasta ahora vivían duplicados en specs:
 *   - `paxSearchQueries`: queries de búsqueda del pax para la precondición/cleanup de
 *     tarjeta vía API (venían hardcodeadas en el add-card Authorize: 'smith'/'fast'/'Emanuel').
 */
export type GatewayJourneyDefaults = JourneyDefaults & {
	/** Queries de búsqueda del pax (API getPassengerId) para cleanup de tarjeta — orden de intento. */
	readonly paxSearchQueries: readonly string[];
	/** Cliente canónico del alta de tarjeta (área WAL — factory wallet-add-card, S7). */
	readonly walletClient: string;
	/** Destino canónico del alta de tarjeta (área WAL). */
	readonly walletDestination: string;
};

/** Entrada base: los defaults neutros + los datos WAL del carrier 1521 (suite gateway US). */
const BASE_GATEWAY_JOURNEY_DEFAULTS: GatewayJourneyDefaults = {
	...JOURNEY_DEFAULTS,
	paxSearchQueries: ['smith', 'fast', 'Emanuel'],
	// Datos del add-card Authorize (verificados en vivo): cliente contractor 'fast car',
	// destino canónico del happy path.
	walletClient: JOURNEY_DEFAULTS.contractorClient,
	walletDestination: JOURNEY_DEFAULTS.destination
};

/**
 * Defaults por pasarela con fallback `default` (S8). Los adapters (`adapter.journeyDefaults`)
 * apuntan cada uno a SU entrada; los specs/factories cross-gateway resuelven vía
 * `journeyDefaultsFor(gateway)`.
 *
 * Mercado Pago corre contra el carrier ARG (no el 1521 US): cliente individuo canónico
 * 'Emanuel mercadopago' (id=10785) + destino 'Reconquista 661' — datos que estaban
 * duplicados como `MP_CLIENT` / `MP_DESTINATION` en los specs MP (no-hold + wallet).
 */
export const JOURNEY_DEFAULTS_BY_GATEWAY: Record<'default' | GatewayName, GatewayJourneyDefaults> = {
	default: BASE_GATEWAY_JOURNEY_DEFAULTS,
	stripe: BASE_GATEWAY_JOURNEY_DEFAULTS,
	authorize: BASE_GATEWAY_JOURNEY_DEFAULTS,
	ebizcharge: BASE_GATEWAY_JOURNEY_DEFAULTS,
	'mercado-pago': {
		...BASE_GATEWAY_JOURNEY_DEFAULTS,
		// Cliente individuo TEST del carrier ARG: Emanuel mercadopago, id=10785 (recording test-14).
		client: 'Emanuel mercadopago',
		// El cliente individuo auto-asigna el pasajero (campo #passenger deshabilitado) — la grilla
		// de gestión muestra el nombre del cliente.
		passenger: 'Emanuel mercadopago',
		appPaxPassenger: 'Emanuel mercadopago',
		destination: 'Reconquista 661, Ciudad Autónoma de Buenos Aires',
		// WAL MP (recording test-14/15): mismo cliente individuo + destino Reconquista.
		walletClient: 'Emanuel mercadopago',
		walletDestination: 'Reconquista 661, Ciudad Autónoma de Buenos Aires'
	}
};

/** Resuelve los journey defaults de `gateway` (con fallback a la entrada `default`). */
export function journeyDefaultsFor(gateway: GatewayName): GatewayJourneyDefaults {
	return JOURNEY_DEFAULTS_BY_GATEWAY[gateway] ?? JOURNEY_DEFAULTS_BY_GATEWAY.default;
}

/**
 * Alias legacy. Los nuevos archivos deben importar `JOURNEY_DEFAULTS` directamente.
 * Conservado para preservar imports existentes (decenas de specs y POMs).
 */
export const TEST_DATA = JOURNEY_DEFAULTS;
