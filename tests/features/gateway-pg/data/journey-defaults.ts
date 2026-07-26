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
	destination: 'Cazadores 1987, Buenos Aires, Argentina',
} as const;

/**
 * Shape de los journey defaults — lo referencian los adapters (`journeyDefaults`).
 * Seam S8 (carrier/gateway-standardization): cuando exista `JOURNEY_DEFAULTS_BY_GATEWAY`
 * cada adapter apuntará a su entrada por pasarela; hoy las 4 comparten este set.
 */
export type JourneyDefaults = typeof JOURNEY_DEFAULTS;

/**
 * Alias legacy. Los nuevos archivos deben importar `JOURNEY_DEFAULTS` directamente.
 * Conservado para preservar imports existentes (decenas de specs y POMs).
 */
export const TEST_DATA = JOURNEY_DEFAULTS;
