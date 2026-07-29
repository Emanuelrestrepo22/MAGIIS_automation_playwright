/**
 * authorize-account-guard.ts — GATE DE VALIDEZ DE MEDICIÓN para el circuito Authorize.net.
 * ========================================================================================
 *
 * El problema que resuelve (ronda 4 del `RUN-LOG.md`, cierre de campaña): **hay DOS cuentas
 * Authorize en juego y no son la misma**.
 *
 *   - La cuenta detrás de `AUTHORIZE_API_LOGIN_ID` / `AUTHORIZE_TRANSACTION_KEY` de `.env.test`
 *     está en **Test Mode**: devuelve una respuesta ENLATADA idéntica para TODOS los triggers
 *     (`responseCode '1'`, `authCode '000000'`, `transId '0'`, `testRequest '1'`,
 *     `avsResultCode 'P'`, `cvvResultCode ''`) — 15/15 reproducible. Los triggers de ZIP/CVV
 *     nunca se evalúan.
 *   - El backend de MAGIIS, en cambio, produjo `state: NO_AUTH` con ZIP 46225 — algo que una
 *     cuenta en Test Mode NO puede hacer. Usa otra cuenta/modo.
 *
 * Por qué esto es un GUARD y no una nota en un doc: la suite CFG **vincula la pasarela con
 * estas mismas credenciales** (`GatewaySwitchSteps.linkAuthorize` → `.env`), así que un run de
 * CFG deja al carrier apuntando a la cuenta enlatada. Cualquier medición de pago posterior
 * (hold, add-card, cobro a bordo, E2E) corre contra respuestas enlatadas y **pasa en verde sin
 * haber autorizado nada**: un falso positivo, no un skip. Es la causa raíz de la
 * no-determinación observada entre rondas (ZIP 46225: 1× NO_AUTH vs 2× SEARCHING_DRIVER).
 *
 * Semántica elegida — **falla, no skipea**. Un skip diría "no se pudo medir"; acá el riesgo es
 * el opuesto: el test SÍ corre y reporta un verde vacío. Falla ruidosa con mensaje accionable.
 *
 * Uso (una vez por spec de pago, en `beforeAll` — la respuesta se memoiza por worker):
 *
 * ```ts
 * test.beforeAll(async () => {
 *     await assertAuthorizeAccountMeasuresRealAuthorizations();
 * });
 * ```
 *
 * NO se aplica a la suite CFG (link/unlink/exclusividad/status): esos casos no miden dinero,
 * validan la configuración de la pasarela y son válidos contra cualquier cuenta.
 */

import { request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import type { AuthorizeApiResponse } from '@schemas/authorize.types';

import { AUTHORIZE_CARDS } from '@fixtures/gateways/authorize/card-policy';
import { AuthorizeSandboxApi, hasAuthorizeCredentials } from '@api/AuthorizeSandboxApi';

/** Firma de la respuesta enlatada de una cuenta en Test Mode (evidencia ronda 4, 15/15). */
const CANNED_TRANS_ID = '0';
const CANNED_AUTH_CODE = '000000';

/** Monto de control del probe — distintivo a propósito para reconocerlo en el Merchant Interface. */
const GUARD_AMOUNT = '1.11';

/** Veredicto sobre la cuenta que responde a las credenciales del entorno. */
export interface AuthorizeAccountVerdict {
	/** `true` = cuenta en Test Mode: respuesta enlatada, triggers inertes, medición de pago INVÁLIDA. */
	canned: boolean;
	transId: string;
	authCode: string;
	testRequest: string;
	avsResultCode: string;
	cvvResultCode: string;
}

/**
 * Clasifica una respuesta cruda del sandbox. El discriminador es el par
 * `transId '0'` + `authCode '000000'`: una cuenta que procesa de verdad SIEMPRE devuelve un
 * `transId` real en una autorización aprobada. `testRequest` se reporta como corroboración
 * (no se exige, porque es un campo que el sandbox no documenta como estable).
 */
export function classifyAuthorizeAccount(response: AuthorizeApiResponse): AuthorizeAccountVerdict {
	const tx = response.transactionResponse;
	const transId = tx?.transId ?? '';
	const authCode = tx?.authCode ?? '';
	return {
		canned: transId === CANNED_TRANS_ID && authCode === CANNED_AUTH_CODE,
		transId,
		authCode,
		testRequest: tx?.testRequest ?? '',
		avsResultCode: tx?.avsResultCode ?? '',
		cvvResultCode: tx?.cvvResultCode ?? ''
	};
}

/** Memo por worker: el probe cuesta una autorización real, se pide una sola vez por proceso. */
let cachedVerdict: AuthorizeAccountVerdict | null = null;

/**
 * Utility (silent-fail, devuelve `null`): pide un `authOnly` de control y clasifica la cuenta.
 * Devuelve `null` si faltan credenciales o si el sandbox no contesta — el que decide qué hacer
 * con la ausencia de señal es el llamador, no este helper.
 */
export async function readAuthorizeAccountMode(request?: APIRequestContext): Promise<AuthorizeAccountVerdict | null> {
	if (cachedVerdict) return cachedVerdict;
	if (!hasAuthorizeCredentials()) return null;

	const ownContext = request ? null : await playwrightRequest.newContext();
	try {
		const api = new AuthorizeSandboxApi({ request: request ?? ownContext! });
		const response = await api.authorizeOnly({
			card: AUTHORIZE_CARDS.SUCCESS,
			amount: GUARD_AMOUNT,
			refId: `acct-guard-${Date.now()}`.slice(0, 20)
		});
		cachedVerdict = classifyAuthorizeAccount(response);
		return cachedVerdict;
	} catch {
		return null;
	} finally {
		await ownContext?.dispose();
	}
}

/**
 * Gate público (fail-fast): lanza si la cuenta que responde es la ENLATADA de Test Mode, porque
 * cualquier oráculo de pago sobre ella es un falso positivo.
 *
 * No lanza cuando no hay señal (`null`): sin credenciales el spec ya se auto-skipea por su
 * propio `test.skip(!hasAuthorizeCredentials())`, y un sandbox caído es un fallo de entorno que
 * el propio test reportará con su mensaje — este guard solo habla de la VALIDEZ de la medición.
 */
export async function assertAuthorizeAccountMeasuresRealAuthorizations(request?: APIRequestContext): Promise<void> {
	const verdict = await readAuthorizeAccountMode(request);
	if (!verdict || !verdict.canned) return;

	throw new Error(
		'[GUARD][AUTHORIZE-ACCOUNT] La cuenta detrás de AUTHORIZE_API_LOGIN_ID está en TEST MODE: ' +
			`devuelve la respuesta enlatada (transId "${verdict.transId}", authCode "${verdict.authCode}", ` +
			`testRequest "${verdict.testRequest}", avs "${verdict.avsResultCode}", cvv "${verdict.cvvResultCode}") ` +
			'para CUALQUIER tarjeta, así que los triggers de ZIP/CVV no se evalúan y esta medición de pago ' +
			'sería un FALSO POSITIVO: verde sin haber autorizado nada.\n' +
			'CAUSA RAÍZ CONOCIDA: la suite CFG vincula la pasarela con estas mismas credenciales ' +
			'(GatewaySwitchSteps.linkAuthorize), así que un run de CFG deja al carrier apuntando a esta cuenta.\n' +
			'PARA DESBLOQUEAR: poner en .env.test las credenciales de la MISMA cuenta Authorize que administra ' +
			'el equipo (la que tiene los filtros AVS configurados y devuelve transIds reales), re-vincular la ' +
			'pasarela y re-correr. Detalle: docs/gateway-pg/authorize/EXTERNAL-BLOCKERS.md'
	);
}

/** Resetea el memo. Solo para tests del propio guard. */
export function resetAuthorizeAccountModeCache(): void {
	cachedVerdict = null;
}
