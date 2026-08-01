/**
 * PROBE — ¿esta cuenta sandbox de Authorize.net aplica los filtros AVS / CVV?
 * ===========================================================================
 *
 * La pregunta la abrió el área F (ver `hold-area-f-probe.spec.ts` y la ronda 4 del
 * `RUN-LOG.md`): con los 3 intents de decline el hold de MAGIIS devuelve
 * `cardValidationWithHold → true` y el viaje se crea en `SEARCHING_DRIVER`, igual que el happy
 * path. Hay exactamente dos explicaciones y son incompatibles:
 *
 *   1. **MAGIIS ignora un rechazo de la pasarela** → defecto de producto grave (riesgo de dinero).
 *   2. **La pasarela nunca rechaza** → los triggers de ZIP/CVV son inertes en ESTA cuenta, y el
 *      comportamiento de MAGIIS es el correcto para una autorización aprobada.
 *
 * El discriminador no está en la UI ni en la API de MAGIIS: está en la respuesta CRUDA de
 * Authorize.net. Este probe la pide directo al sandbox (sin pasar por MAGIIS) y la vuelca
 * entera — `responseCode`, `avsResultCode`, `cvvResultCode`, `authAmount` y los `messages`.
 *
 * NO asserta: los contract tests de `api/authorize-sandbox/` ya son los que assertan el
 * contrato. Este archivo existe para dejar la EVIDENCIA legible cuando esos assertions fallan y
 * hay que decidir si el drift es de la cuenta, del dato o del producto.
 *
 * Tag `@probe` a propósito: fuera de `@gateway`/`@authorize`, no entra en la regresión.
 */
import { test } from '@TestFixture';
import { AUTHORIZE_CARDS } from '@fixtures/gateways/authorize/card-policy';
import { AuthorizeSandboxApi, hasAuthorizeCredentials } from '@api/AuthorizeSandboxApi';

const LOG = '[PROBE][AUTHORIZE-ACCOUNT]';

/** Tarjetas cuyo outcome depende del filtro AVS / CVV del merchant, + el control aprobado. */
const CASES = [
	{ nombre: 'CONTROL aprobada (CVV 900 / ZIP 90210)', card: AUTHORIZE_CARDS.SUCCESS, esperado: 'responseCode 1' },
	{ nombre: 'DECLINE_AUTHORIZE (ZIP 46282)', card: AUTHORIZE_CARDS.DECLINE_GENERIC, esperado: 'responseCode 2 (declined)' },
	{ nombre: 'DECLINE_INVALID_CVC (CVV 901)', card: AUTHORIZE_CARDS.DECLINE_CVV, esperado: 'cvvResultCode N' },
	{ nombre: 'DECLINE_PREPAID_ZERO_BALANCE (ZIP 46228)', card: AUTHORIZE_CARDS.PREPAID_ZERO, esperado: 'prepaid, balance 0' },
	{ nombre: 'HAPPY_PARTIAL_AUTH (ZIP 46225)', card: AUTHORIZE_CARDS.PARTIAL_AUTH, esperado: 'authAmount < amount pedido' }
] as const;

test.describe('[PROBE] cuenta sandbox Authorize — filtros AVS/CVV y autorización parcial @probe', () => {
	test.describe.configure({ mode: 'serial' });
	test.skip(!hasAuthorizeCredentials(), 'AUTHORIZE_API_LOGIN_ID/TRANSACTION_KEY no seteadas en env');

	test('@probe volcado crudo de authOnlyTransaction por trigger', async ({ request }) => {
		const api = new AuthorizeSandboxApi({ request });
		// Monto no redondo y > $1.23 a propósito: es lo que hace observable una autorización
		// parcial (si la cuenta la aplica, `authAmount` viene distinto del pedido).
		const amount = '25.50';

		for (const { nombre, card, esperado } of CASES) {
			const response = await api.authorizeOnly({ card, amount, refId: `probe-account-${Date.now()}` });
			const tx = response.transactionResponse;
			console.log(
				`\n${LOG} ═══ ${nombre} — PAN ${card.number} · CVV ${card.cvc} · ZIP ${card.zip ?? '—'} · pedido USD ${amount} ═══\n` +
					`${LOG} esperado por la doc del sandbox: ${esperado}\n` +
					`${LOG} resultCode=${response.messages?.resultCode} · responseCode=${tx?.responseCode ?? '—'} · ` +
					`avsResultCode="${tx?.avsResultCode ?? ''}" · cvvResultCode="${tx?.cvvResultCode ?? ''}" · accountType=${tx?.accountType ?? '—'}\n` +
					`${LOG} respuesta CRUDA: ${JSON.stringify(response)}`
			);
		}
	});
});
