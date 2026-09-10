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
// Grupo 1 = prefijo completo hasta el valor (ancla de contexto + nombre + separador,
//   comillas incluidas). El nombre solo matchea si está anclado a un contexto real de
//   header -- inicio de línea, o inmediatamente después de "{", "," o un salto de línea --
//   NUNCA a mitad de una oración (ej. "insufficient authorization: ..." no matchea).
// Grupo 2 = valor entre comillas JSON (si aplica) -- se usa solo para saber si había comillas.
// El valor se corta en fin de línea o comilla/llave de cierre de JSON -- NUNCA en una coma,
// porque un Set-Cookie real (con "Expires=...GMT") y un set-cookie con múltiples cookies
// unidas por ", " contienen comas legítimas dentro del propio valor.
function buildHeaderPattern(name: string): RegExp {
	return new RegExp(
		`((?:^|[\\r\\n{,])\\s*[-*]?\\s*"?\\b${name}\\b"?\\s*:\\s*)("(?:[^"\\\\]|\\\\.)*"|[^\\r\\n}]*)`,
		'gim'
	);
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
