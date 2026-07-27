/**
 * MP-WALLET (web) · cliente individuo — vincular y eliminar tarjeta desde el alta de viaje
 * (carrier ARG, TEST). Superficie WEB del carrier (distinta del wallet mobile de App Pax).
 *
 * CONSUMIDOR THIN de la factory WAL (S7, carrier/gateway-standardization):
 * `specs/_parametrized/factories/wallet-add-card.factory.ts` con `deleteAfterAdd` — MISMA
 * cobertura que el spec original (recording test-14/15): alta de tarjeta MP (holder APRO,
 * trigger del outcome) + eliminación desde el dropdown de métodos. Datos por adapter:
 * tarjeta `resolveCard({gateway:'mercado-pago',intent:'HAPPY_NO_AUTH'})`, cliente
 * 'Emanuel mercadopago' + destino Reconquista 661 de `journeyDefaults` (S8).
 *
 * Sin annotation tms: el registry WAL de MP es `null` (sin issue Xray aún — no inventar).
 * `cleanupBeforeAdd: false`: el spec original no limpiaba por API (la validación MP no
 * completa en TEST → el test skipea antes del delete, igual que el original).
 *
 * ⚠️ DRAFT/FRAGILE: locators de eliminación del recorder (clases Angular dinámicas) viven
 * ahora en `CarrierNewTravelPage.deleteHighlightedSavedCard` — confirmar en corrida viva.
 */
import { defineWalletAddCardSuite } from '@features/gateway-pg/specs/_parametrized/factories/wallet-add-card.factory';

defineWalletAddCardSuite('mercado-pago', {
	tcId: 'MP-WALLET-WEB',
	extraTags: '@smoke @gateway-pg @carrier',
	deleteAfterAdd: true,
	cleanupBeforeAdd: false
});
