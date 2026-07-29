/**
 * Resolver cross-gateway del COBRO de la Driver App (Cargo a Bordo).
 * ===================================================================
 *
 * Traduce un `{ gateway, intent }` canónico al `DriverChargeSpec` que consume
 * `CargoABordoSteps.runCargoScenario` (`options.driverAppStep.charge`). Es el equivalente,
 * para el área CARGO, de lo que `resolveCard` es para el área HOLD: el DATO de la tarjeta
 * cambia por pasarela, el COMPORTAMIENTO esperado no.
 *
 * Antes de esto los 12 specs de cargo importaban `STRIPE_TEST_CARDS_RAW` directamente, lo que
 * ataba el área entera a Stripe. Acá:
 *   - la tarjeta sale de `resolveCard({gateway,intent})` → `GenericTestCard` (SoT por pasarela,
 *     jamás PANs inventados; si el intent no aplica a la pasarela, el resolver LANZA);
 *   - el outcome sale de `outcomeForIntent(intent)` (`helpers/journey-outcome.ts`) — no se
 *     hardcodea 'declined'/'success' por caso.
 *
 * ── Traducción JourneyOutcome → outcome del cobro en la Driver App ────────────────────────────
 * `OUTCOME_BY_INTENT` registra el desenlace del ALTA DE VIAJE con tarjeta preautorizada (área
 * HOLD): ahí la transacción ocurre en la web del carrier. En Cargo a Bordo NO hay retención
 * previa: la MISMA intención de tarjeta se ejerce más tarde, cuando el conductor cobra al
 * finalizar el viaje. Lo que se conserva es el veredicto de la pasarela sobre la tarjeta:
 *
 *   | JourneyOutcome (área HOLD)          | DriverChargeSpec.expectedOutcome (área CARGO) |
 *   |-------------------------------------|-----------------------------------------------|
 *   | 'trip-created'                      | 'success'   — la pasarela aprueba              |
 *   | 'card-rejected' / 'trip-unauthorized'| 'declined'  — la pasarela rechaza             |
 *
 * La distinción HOLD entre `card-rejected` (rechaza al vincular ⇒ el viaje no se crea) y
 * `trip-unauthorized` (rechaza el hold del viaje ⇒ viaje NO_AUTORIZADO) NO tiene análogo en
 * Cargo a Bordo: acá el viaje YA existe y se completó cuando llega el cobro, así que ambos
 * colapsan a "el cobro se rechaza en la Driver App". Los intents sin outcome verificado hacen
 * lanzar a `outcomeForIntent` — mismo contrato, no se acredita un desenlace sin evidencia.
 *
 * ── Qué falta confirmar EN VIVO (ambiente `apps-test` CAÍDO al 2026-07-28) ────────────────────
 *   - Ningún caso de esta ruta corrió con `APPIUM=1` contra Authorize ni eBizCharge: el mapeo
 *     intent → outcome del cobro está DERIVADO del área HOLD, no observado en el modal de cobro
 *     de la Driver App.
 *   - eBizCharge: el modal de cobro de la Driver App se asume el mismo form nativo que Stripe
 *     Elements renderiza hoy (`DriverTripPaymentScreen`) — SIN VERIFICAR. Si eBiz pide un 5°
 *     campo (`adapter.nativeExtraField`, hoy sin confirmar para eBiz), `CardData` no lo modela.
 *   - `postal` sólo se puebla si la pasarela expone `zip` en su `GenericTestCard` (hoy: Authorize
 *     vía trigger AVS). Que el modal de la Driver App acepte/exija ese campo está SIN VERIFICAR.
 */

import type { DriverChargeSpec } from '@steps/index';
import type { CardIntent, GatewayName } from '@fixtures/gateways/_shared';

import { resolveCard } from '@fixtures/gateways/_shared';

import { outcomeForIntent, type JourneyOutcome } from './journey-outcome';

export type ResolveDriverChargeArgs = {
	/** Pasarela vinculada al carrier — selecciona la SoT de tarjetas. */
	gateway: GatewayName;
	/** Intención canónica del cobro (HAPPY_NO_AUTH / DECLINE_AUTHORIZE / DECLINE_INVALID_CVC / …). */
	intent: CardIntent;
	/**
	 * Outcome explícito del cobro — escapa a `outcomeForIntent` cuando el intent todavía no tiene
	 * comportamiento verificado (mismo criterio que `expectOutcome` en los specs de hold).
	 */
	expectOutcome?: DriverChargeSpec['expectedOutcome'];
};

/** Veredicto de la pasarela: aprueba ⇒ el cobro sale bien; cualquier rechazo ⇒ cobro declinado. */
function chargeOutcomeFor(outcome: JourneyOutcome): DriverChargeSpec['expectedOutcome'] {
	return outcome === 'trip-created' ? 'success' : 'declined';
}

/**
 * Construye el `DriverChargeSpec` de `{gateway,intent}`. Ver la tabla de traducción en el doc
 * del módulo.
 *
 * @throws Si la pasarela no soporta el intent (`resolveCard`) o si el intent no tiene outcome
 *   verificado y no se pasó `expectOutcome` (`outcomeForIntent`). Ambos son fallos en TIEMPO DE
 *   DEFINICIÓN de la suite — preferible a un default silencioso.
 */
export function resolveDriverCharge({ gateway, intent, expectOutcome }: ResolveDriverChargeArgs): DriverChargeSpec {
	const card = resolveCard({ gateway, intent });

	return {
		card: {
			number: card.number,
			expiry: card.expiry,
			cvc: card.cvc,
			holderName: card.holderName,
			// `zip` sólo existe en las pasarelas cuyo trigger lo usa (Authorize AVS) — omitido si no.
			...(card.zip ? { postal: card.zip } : {})
		},
		expectedOutcome: expectOutcome ?? chargeOutcomeFor(outcomeForIntent(intent)),
		// 3DS es exclusivo Stripe (`requires3ds` de la card normalizada); el resto siempre false.
		...(card.requires3ds ? { is3ds: true } : {})
	};
}
