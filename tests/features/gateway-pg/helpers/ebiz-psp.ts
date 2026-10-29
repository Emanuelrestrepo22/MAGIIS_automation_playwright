/**
 * Capa PSP de eBizCharge por SOAP — la pata del procesador para la trifuerza.
 * ===========================================================================
 *
 * eBizCharge no nos da dashboard (restricción de la campaña: la validación de operaciones
 * va por API o DB). Lo que SÍ da es su API SOAP con las mismas credenciales del merchant
 * que usa el vínculo del carrier — verificado en vivo 2026-07-31 con el ciclo hold→release
 * del viaje 67969 (`docs/gateway-pg/ebizcharge/RUN-LOG.md` §"Validación exploratoria").
 *
 * Identidad punta a punta que hace útil esta capa: el `RefNum` del PSP es el MISMO valor
 * que el `intentId` de los logs MGW y que `CARD_HOLDS.INTENT_ID`. Y para el alta de
 * tarjeta, la transacción de validación aparece en `SearchTransactions` con su
 * `CardNumber` enmascarado (correlacionable por last4).
 *
 * Reloj: el PSP corre 7 horas DETRÁS del reloj de la DB MAGIIS/host. `searchSince`
 * compensa con margen; el que correlaciona igual debe filtrar por last4, no por hora.
 *
 * Fallo: utilities silenciosas (retornan null/[] sin creds o ante error de red) — esta
 * capa es FORENSE, acompaña a un oráculo UI/DB que ya decidió; jamás debe convertir
 * "no pude mirar el PSP" en un rojo propio.
 */

const SOAP_ENDPOINT = 'https://soap.ebizcharge.net/eBizService.svc';
const SOAP_NS = 'http://eBizCharge.ServiceModel.SOAP';
/** Horas que el reloj del PSP corre detrás del reloj local/DB (medido 2026-07-31). */
const PSP_CLOCK_OFFSET_HOURS = 7;

export interface EbizPspCreds {
	securityId: string;
	userId: string;
	password: string;
}

export interface EbizPspTransaction {
	refNum: string;
	dateTime: string;
	amount: string;
	authAmount: string;
	authCode: string;
	/** Estado ACTUAL de la transacción (Voided / Authorized / Settled / Error...). */
	status: string;
	transactionType: string;
	/** Veredicto de la autorización original: A=Approved, D=Declined, E=Error. */
	resultCode: string;
	result: string;
	errorCode: string;
	error: string;
	avsResultCode: string;
	cardCodeResult: string;
	/** PAN enmascarado tal como lo devuelve el PSP (correlacionar por slice(-4)). */
	cardNumberMasked: string;
}

export function ebizPspCredsFromEnv(): EbizPspCreds | null {
	const securityId = process.env.EBIZ_SECURITY_KEY;
	const userId = process.env.EBIZ_MERCHANT_USER;
	const password = process.env.EBIZ_MERCHANT_PASSWORD;
	if (!securityId || !userId || !password) return null;
	return { securityId, userId, password };
}

function xmlEscape(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function tokenXml(creds: EbizPspCreds): string {
	return (
		`<e:securityToken><e:SecurityId>${xmlEscape(creds.securityId)}</e:SecurityId>` +
		`<e:UserId>${xmlEscape(creds.userId)}</e:UserId>` +
		`<e:Password>${xmlEscape(creds.password)}</e:Password></e:securityToken>`
	);
}

async function soapCall(action: string, bodyXml: string): Promise<string | null> {
	const envelope =
		`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:e="${SOAP_NS}">` +
		`<s:Body>${bodyXml}</s:Body></s:Envelope>`;
	try {
		const res = await fetch(SOAP_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'text/xml; charset=utf-8',
				SOAPAction: `${SOAP_NS}/IeBizService/${action}`
			},
			body: envelope,
			signal: AbortSignal.timeout(30_000)
		});
		if (!res.ok) return null;
		return await res.text();
	} catch {
		return null;
	}
}

function tag(fragment: string, name: string): string {
	const match = fragment.match(new RegExp(`<${name}>([^<]*)</${name}>`));
	return match?.[1] ?? '';
}

/** El estado ACTUAL vive en el ÚLTIMO <Status> del objeto (el primero es el eco de la auth). */
function currentStatus(fragment: string): string {
	const all = [...fragment.matchAll(/<Status>([^<]*)<\/Status>/g)];
	return all.length > 0 ? all[all.length - 1][1] : '';
}

function parseTransaction(fragment: string): EbizPspTransaction {
	return {
		refNum: tag(fragment, 'RefNum'),
		dateTime: tag(fragment, 'DateTime'),
		amount: tag(fragment, 'Amount'),
		authAmount: tag(fragment, 'AuthAmount'),
		authCode: tag(fragment, 'AuthCode'),
		status: currentStatus(fragment),
		transactionType: tag(fragment, 'TransactionType'),
		resultCode: tag(fragment, 'ResultCode'),
		result: tag(fragment, 'Result'),
		errorCode: tag(fragment, 'ErrorCode'),
		error: tag(fragment, 'Error'),
		avsResultCode: tag(fragment, 'AvsResultCode'),
		cardCodeResult: tag(fragment, 'CardCodeResultCode'),
		cardNumberMasked: tag(fragment, 'CardNumber')
	};
}

/** Consulta una transacción puntual por su RefNum (== intentId de MGW / CARD_HOLDS.INTENT_ID). */
export async function getEbizTransaction(creds: EbizPspCreds, refNum: string): Promise<EbizPspTransaction | null> {
	const xml = await soapCall(
		'GetTransactionDetails',
		`<e:GetTransactionDetails>${tokenXml(creds)}<e:transactionRefNum>${xmlEscape(refNum)}</e:transactionRefNum></e:GetTransactionDetails>`
	);
	if (!xml || !xml.includes('<GetTransactionDetailsResult')) return null;
	const tx = parseTransaction(xml);
	return tx.refNum ? tx : null;
}

/**
 * Todas las transacciones del merchant creadas desde `since` (reloj local — el offset del
 * PSP se compensa acá). Filtrar después por `cardNumberMasked.endsWith(last4)`.
 */
export async function searchEbizTransactionsSince(
	creds: EbizPspCreds,
	since: Date,
	options: { limit?: number } = {}
): Promise<EbizPspTransaction[]> {
	const pspSince = new Date(since.getTime() - PSP_CLOCK_OFFSET_HOURS * 3_600_000 - 60_000);
	const pad = (n: number) => String(n).padStart(2, '0');
	const value =
		`${pspSince.getFullYear()}-${pad(pspSince.getMonth() + 1)}-${pad(pspSince.getDate())} ` +
		`${pad(pspSince.getHours())}:${pad(pspSince.getMinutes())}:${pad(pspSince.getSeconds())}`;
	const xml = await soapCall(
		'SearchTransactions',
		`<e:SearchTransactions>${tokenXml(creds)}` +
			`<e:filters><e:SearchFilter><e:FieldName>created</e:FieldName>` +
			`<e:ComparisonOperator>gte</e:ComparisonOperator>` +
			`<e:FieldValue>${value}</e:FieldValue></e:SearchFilter></e:filters>` +
			`<e:matchAll>true</e:matchAll><e:countOnly>false</e:countOnly>` +
			`<e:start>0</e:start><e:limit>${options.limit ?? 25}</e:limit><e:sort>created</e:sort>` +
			`</e:SearchTransactions>`
	);
	if (!xml) return [];
	return [...xml.matchAll(/<TransactionObject>([\s\S]*?)<\/TransactionObject>/g)].map(([, f]) => parseTransaction(f));
}

/**
 * Resumen forense de los intentos del PSP para UNA tarjeta desde `since` — el texto que se
 * agrega al diagnóstico del caso (una línea por transacción, veredicto de auth + estado).
 */
export async function describeEbizAttemptsForCard(creds: EbizPspCreds, since: Date, last4: string): Promise<string> {
	const all = await searchEbizTransactionsSince(creds, since);
	const propias = all.filter(tx => tx.cardNumberMasked.endsWith(last4));
	if (all.length === 0)
		return '[PSP] SearchTransactions no devolvió transacciones en la ventana (o la capa PSP no respondió).';
	if (propias.length === 0) {
		return `[PSP] NINGUNA transacción para •••• ${last4} en la ventana (${all.length} de otras tarjetas): la validación del alta no llegó al procesador.`;
	}
	const lineas = propias.map(
		tx =>
			`[PSP] •••• ${last4} → RefNum ${tx.refNum} (${tx.dateTime} PSP): auth ${tx.resultCode}-${tx.result}` +
			(tx.errorCode !== '0' && tx.error ? ` · código ${tx.errorCode} "${tx.error}"` : '') +
			` · $${tx.authAmount || tx.amount} · estado actual ${tx.status} (${tx.transactionType})` +
			(tx.avsResultCode ? ` · AVS ${tx.avsResultCode}` : '')
	);
	return lineas.join('\n');
}
