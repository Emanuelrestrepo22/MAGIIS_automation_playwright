/**
 * PROBE — ¿a qué cuenta Authorize apunta ESTE entorno, y la medición de pago es válida?
 * =====================================================================================
 *
 * Read-out de una línea del gate `helpers/authorize-account-guard.ts`. Responde la pregunta
 * que abrió la ronda 4 del `RUN-LOG.md` y que hay que contestar ANTES de creer cualquier
 * verde de pago: las credenciales de `.env.test` pegan contra la cuenta en **Test Mode**
 * (respuesta enlatada, triggers de ZIP/CVV inertes, `transId '0'`) o contra la cuenta REAL
 * que usa el backend de MAGIIS.
 *
 * Diferencia con `sandbox-avs-cvv-account-probe.spec.ts`: ese vuelca la respuesta CRUDA de los
 * 5 triggers (evidencia detallada). Este pide UN `authOnly` de control y emite el veredicto +
 * el mensaje accionable exacto que verán los specs de pago cuando el guard los corte.
 *
 * NO asserta el veredicto a propósito: el probe existe para INFORMAR el estado del entorno,
 * no para fallar por él. Quien falla es el guard, dentro de los specs que sí miden dinero
 * (`runHoldScenario`, `defineWalletAddCardSuite`, `defineCardOutcomeMatrixSuite`).
 *
 * Tag `@probe`: fuera de `@gateway`/`@authorize`, no entra en la regresión.
 */
import { test } from '@TestFixture';
import { hasAuthorizeCredentials } from '@api/AuthorizeSandboxApi';
import {
	assertAuthorizeAccountMeasuresRealAuthorizations,
	readAuthorizeAccountMode
} from '@features/gateway-pg/helpers/authorize-account-guard';

const LOG = '[PROBE][AUTHORIZE-ACCOUNT-MODE]';

test.describe('[PROBE] modo de la cuenta Authorize del entorno @probe', () => {
	test.skip(!hasAuthorizeCredentials(), 'AUTHORIZE_API_LOGIN_ID/TRANSACTION_KEY no seteadas en env');

	test('@probe veredicto del guard de validez de medición', async ({ request }) => {
		const verdict = await readAuthorizeAccountMode(request);

		if (!verdict) {
			console.log(`${LOG} SIN SEÑAL — sandbox no contestó o faltan credenciales. Nada que concluir.`);
			return;
		}

		console.log(
			`\n${LOG} cuenta ${verdict.canned ? '🔴 ENLATADA (Test Mode) — medición de pago INVÁLIDA' : '🟢 REAL — mide autorizaciones de verdad'}\n` +
				`${LOG} transId="${verdict.transId}" · authCode="${verdict.authCode}" · testRequest="${verdict.testRequest}" · ` +
				`avs="${verdict.avsResultCode}" · cvv="${verdict.cvvResultCode}"`
		);

		// Muestra el mensaje EXACTO con el que el guard cortará los specs de pago, sin fallar acá.
		try {
			await assertAuthorizeAccountMeasuresRealAuthorizations(request);
			console.log(`${LOG} el guard NO corta: los specs de pago pueden correr.`);
		} catch (err) {
			console.log(`${LOG} el guard CORTA los specs de pago con:\n${(err as Error).message}`);
		}
	});
});
