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

/**
 * Monto de control del probe. El prefijo `1.` se mantiene fijo a propósito (todo probe del guard
 * es un cargo de $1.xx, reconocible de un vistazo en el Merchant Interface) pero los centavos
 * VARÍAN por invocación.
 *
 * Por qué: Authorize.Net rechaza transacciones DUPLICADAS (misma tarjeta + mismo monto dentro de
 * una ventana de ~2 min) y ese rechazo responde `transId "0"` con `authCode ""`. Con el monto fijo
 * en `1.11`, el segundo probe de una misma corrida (otro worker / otro project — el memo es por
 * proceso) recibía ese rechazo y el guard lo interpretaba como cuenta REAL, porque su
 * discriminador exigía `authCode === '000000'`. Observado en vivo el 2026-07-29: dos probes
 * consecutivos, el primero `transId "80057740303"`, el segundo `transId "0"` / `authCode ""`,
 * ambos reportados 🟢 REAL. Variar los centavos saca al probe de la ventana de duplicados.
 */
function guardAmount(): string {
	// 2 dígitos derivados del reloj: suficiente para no repetir monto dentro de la ventana.
	const cents = String(Math.floor(Date.now() / 1000) % 100).padStart(2, '0');

	return `1.${cents}`;
}

/** Veredicto sobre la cuenta que responde a las credenciales del entorno. */
export interface AuthorizeAccountVerdict {
	/** `true` = cuenta en Test Mode: respuesta enlatada, triggers inertes, medición de pago INVÁLIDA. */
	canned: boolean;
	/**
	 * `true` = la respuesta NO prueba que la cuenta mida autorizaciones reales, pero tampoco es la
	 * firma enlatada conocida (típicamente `transId "0"` por rechazo/duplicado/error). Se trata
	 * como INDETERMINADO y BLOQUEA: es la misma doctrina del Hallazgo 6 (un verde que no puede
	 * probar la cuenta no prueba nada).
	 */
	inconclusive: boolean;
	transId: string;
	authCode: string;
	testRequest: string;
	avsResultCode: string;
	cvvResultCode: string;
}

/**
 * Clasifica una respuesta cruda del sandbox.
 *
 * El invariante duro es `transId`: una autorización APROBADA por una cuenta que procesa de verdad
 * SIEMPRE devuelve un `transId` no-cero. De ahí los tres estados:
 *   - `transId '0'` + `authCode '000000'` → cuenta enlatada de Test Mode (`canned`).
 *   - `transId '0'` con cualquier otro `authCode` → `inconclusive`. No es la firma enlatada, pero
 *     tampoco una autorización: es rechazo, duplicado o error. NUNCA es "real".
 *   - `transId` no-cero → la cuenta mide de verdad.
 * `testRequest` se reporta como corroboración (no se exige: el sandbox no lo documenta como estable).
 */
export function classifyAuthorizeAccount(response: AuthorizeApiResponse): AuthorizeAccountVerdict {
	const tx = response.transactionResponse;
	const transId = tx?.transId ?? '';
	const authCode = tx?.authCode ?? '';
	const canned = transId === CANNED_TRANS_ID && authCode === CANNED_AUTH_CODE;

	return {
		canned,
		inconclusive: !canned && transId === CANNED_TRANS_ID,
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
			amount: guardAmount(),
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
 * Gate público (fail-fast) TRI-ESTADO — endurecido en Ronda 7 (Hallazgo 6 del RUN-LOG):
 *   - `real`          → la medición vale, no lanza.
 *   - `canned`        → cuenta enlatada de Test Mode: lanza (falso positivo garantizado).
 *   - `indeterminado` → hay credenciales pero el probe no obtuvo veredicto: TAMBIÉN lanza.
 *     El fail-open anterior (`return` con veredicto nulo) era la quinta trampa de vacuidad:
 *     un verde bajo este guard no probaba que la cuenta estuviera bien — podía significar
 *     que el guard no pudo determinarlo. En la ronda limpia cada verde debe PROBAR cuenta real.
 *
 * Única excepción que no lanza: SIN credenciales — ahí la medición nunca ocurre y el spec ya
 * se auto-skipea por su propio `test.skip(!hasAuthorizeCredentials())`.
 */
export async function assertAuthorizeAccountMeasuresRealAuthorizations(request?: APIRequestContext): Promise<void> {
	const verdict = await readAuthorizeAccountMode(request);

	if (!verdict) {
		if (!hasAuthorizeCredentials()) return; // sin creds: gate propio del spec, la medición no corre

		throw new Error(
			'[GUARD][AUTHORIZE-ACCOUNT] Veredicto INDETERMINADO: hay credenciales AUTHORIZE_* en el entorno ' +
				'pero el probe authOnly de control no obtuvo una respuesta clasificable del sandbox (excepción o ' +
				'respuesta sin transactionResponse). NO se puede probar que la cuenta mida autorizaciones reales, ' +
				'así que la medición de pago se BLOQUEA en vez de correr a ciegas (Hallazgo 6, RUN-LOG: un verde ' +
				'bajo guard fail-open no prueba nada). Revisar conectividad con apitest.authorize.net y re-correr; ' +
				'el probe se reintenta en cada llamada (el veredicto nulo no se memoiza).'
		);
	}

	if (verdict.inconclusive) {
		throw new Error(
			'[GUARD][AUTHORIZE-ACCOUNT] Veredicto INDETERMINADO: el probe authOnly de control respondió ' +
				`transId "${verdict.transId}" (authCode "${verdict.authCode}", avs "${verdict.avsResultCode}", ` +
				`cvv "${verdict.cvvResultCode}"). Un transId cero NO es una autorización: es rechazo, error o ` +
				'transacción DUPLICADA. No prueba que la cuenta mida de verdad, así que la medición de pago se ' +
				'BLOQUEA en vez de correr a ciegas.\n' +
				'CAUSA MÁS PROBABLE: duplicado. Authorize rechaza misma tarjeta + mismo monto dentro de ~2 min; ' +
				'esperá ese lapso y re-corré. Si persiste, revisá el estado de la cuenta en el Merchant Interface.'
		);
	}

	if (!verdict.canned) return;

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
