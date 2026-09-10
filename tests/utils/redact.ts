// tests/utils/redact.ts
// Helper único de redacción de secretos en volcados de error/log.
// Motivo: un fallo de red (ej. "socket hang up") en apiRequestContext.fetch de
// Playwright embebe el call log completo -- headers incluidos -- en error.message.
// Si ese mensaje se usa como comment/log (ej. xray-reporter), el token queda
// expuesto tal cual en el sistema de destino (Xray, CI logs, etc.).
//
// Uso: pasar CUALQUIER texto de diagnóstico (error.message, call log, request
// serializado) antes de loguearlo, guardarlo o exportarlo. Preserva el resto
// del volcado -- solo reemplaza el VALOR del header sensible.
//
// Cobertura: headers cuyo nombre matchea (case-insensitive) alguno de:
//   authorization, cookie, set-cookie, x-api-key, proxy-authorization
const SENSITIVE_HEADER_NAMES = ['authorization', 'cookie', 'set-cookie', 'x-api-key', 'proxy-authorization'];

const REDACTED = '[REDACTED]';

// Matchea "<header-name>: <valor>" tal como aparece en:
//   - call log de Playwright: "  - authorization: Bearer eyJ..."
//   - headers serializados JSON: "\"Authorization\": \"Bearer eyJ...\""
//   - texto plano: "Authorization: Bearer eyJ..."
// El valor se corta en fin de línea, coma de cierre de JSON, o comilla de cierre.
function buildHeaderPattern(name: string): RegExp {
	return new RegExp(`("?\\b${name}\\b"?\\s*:\\s*)("(?:[^"\\\\]|\\\\.)*"|[^\\r\\n,}]*)`, 'gi');
}

const HEADER_PATTERNS = SENSITIVE_HEADER_NAMES.map(buildHeaderPattern);

/**
 * Redacta el valor de cualquier header sensible (Authorization, Cookie, Set-Cookie,
 * X-Api-Key, Proxy-Authorization -- case-insensitive) presente en `text`, preservando
 * el resto del contenido para que el diagnóstico siga siendo útil.
 */
export function redactSecrets(text: string): string {
	if (!text) return text;
	let result = text;
	for (const pattern of HEADER_PATTERNS) {
		result = result.replace(pattern, (fullMatch, prefix: string, value: string) => {
			void fullMatch;
			const valueWasQuoted = /^".*"$/.test(value);
			return `${prefix}${valueWasQuoted ? `"${REDACTED}"` : REDACTED}`;
		});
	}
	return result;
}
