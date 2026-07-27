/**
 * Authorize (web) · alta de tarjeta pre-autorizada desde el alta de viaje del carrier (1521, TEST).
 *
 * CONSUMIDOR THIN de la factory WAL (S7, carrier/gateway-standardization):
 * `specs/_parametrized/factories/wallet-add-card.factory.ts` — MISMAS acciones que el spec
 * original (login retry → cleanup API por idempotencia → cliente 'fast car' + destino →
 * "Preautorizada" → form nativo → "Validar" → oráculo "Tarjeta válida") con los DATOS del
 * adapter Authorize: tarjeta `resolveCard({gateway:'authorize',intent:'HAPPY_NO_AUTH'})`
 * (Visa 4111 + CVV 900 + ZIP 10001, VERIFICADA en vivo), cliente/destino/paxSearchQueries
 * de `journeyDefaults` (S8). Conserva la key tms **MG-285** (registry `wallet.addCard`).
 *
 * Authorize NUNCA aplica 3DS y SÍ transacciona en sandbox TEST → sin skip.
 * ⚠️ REPETIBILIDAD: re-validar la MISMA tarjeta sobre un pax que YA la tiene vinculada da
 * "Error al validar" → el cleanup API previo (factory, `cleanupBeforeAdd` default) la borra.
 */
import { defineWalletAddCardSuite } from '@features/gateway-pg/specs/_parametrized/factories/wallet-add-card.factory';

defineWalletAddCardSuite('authorize', { tcId: 'TS-AUTHORIZE-WAL-01' });
