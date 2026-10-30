/**
 * Sesión API del carrier leída de un storageState guardado — precondiciones por API sin login.
 *
 * POR QUÉ. Las specs que crean datos (conceptos de Otros Costos, viajes) necesitan el Bearer del
 * portal carrier, pero un agente o una corrida local NUNCA hace login con contraseña. La sesión
 * la graba un humano (portal carrier V2 → `storage-state-<carrier>-<env>.json`) y acá sólo se lee.
 *
 * CONTRATO DEL FRONT (portal carrier V2, v2.0.17): el localStorage del origin guarda las claves
 * `carrier-<índice StorageKeyEnum>` — sessionToken=0, userRol=9, userId=12 (carrierId),
 * subUserId=28, subUserName=42 — y el header es `Authorization: Bearer <sessionToken>`.
 * Mismo contrato que usa `magiis-carrier-v2-e2e/tests/api/clients/carrierSession.ts`.
 *
 * El token vive en un campo privado: no sale en `toJSON()`, en logs ni en mensajes de error.
 */

import { existsSync, readFileSync } from 'node:fs';

const KEY_SESSION_TOKEN = 'carrier-0';
const KEY_USER_ROL = 'carrier-9';
const KEY_USER_ID = 'carrier-12';
const KEY_SUB_USER_ID = 'carrier-28';
const KEY_SUB_USER_NAME = 'carrier-42';

const REGENERATE_HINT =
	'la sesión la regenera un humano desde el portal; la automatización no hace login con contraseña';

type StorageStateFile = {
	origins?: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
};

export class CarrierStorageSession {
	readonly #token: string;

	constructor(
		readonly origin: string,
		readonly carrierId: number,
		readonly subUserId: number,
		/** Rol sin prefijo `ROLE_` (lo que el front manda como `canceledBy`). */
		readonly role: string,
		/** Nombre del sub-usuario: PII, no va a `toJSON()` ni a evidencia. */
		readonly subUserName: string,
		readonly tokenExpiresAt: Date,
		token: string
	) {
		this.#token = token;
	}

	/** Token para `ApiBase.setAuthToken`. No loguear el resultado. */
	bearerToken(): string {
		return this.#token;
	}

	/** Vista segura para logs y evidencia. */
	toJSON(): Record<string, unknown> {
		return {
			origin: this.origin,
			carrierId: this.carrierId,
			subUserId: this.subUserId,
			tokenExpiresAt: this.tokenExpiresAt.toISOString()
		};
	}
}

function readItem(items: Array<{ name: string; value: string }>, key: string, path: string): string {
	const value = items.find(item => item.name === key)?.value;
	if (!value) throw new Error(`[carrierStorageSession] falta la clave ${key} en ${path}; ${REGENERATE_HINT}`);
	return value;
}

function readPositiveInt(raw: string, key: string): number {
	const value = Number(raw);
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`[carrierStorageSession] la clave ${key} no es un id numérico válido`);
	}
	return value;
}

/** Lee `exp` del payload del JWT sin validar la firma: sólo decide si la sesión sigue vigente. */
function readJwtExpiry(token: string): Date {
	const payload = token.split('.')[1];
	if (!payload)
		throw new Error(`[carrierStorageSession] el token guardado no tiene forma de JWT; ${REGENERATE_HINT}`);
	let exp: unknown;
	try {
		exp = (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown }).exp;
	} catch {
		throw new Error(`[carrierStorageSession] no se pudo decodificar el payload del token; ${REGENERATE_HINT}`);
	}
	if (typeof exp !== 'number') throw new Error(`[carrierStorageSession] el token no trae exp; ${REGENERATE_HINT}`);
	return new Date(exp * 1000);
}

export type LoadCarrierStorageSessionOptions = {
	/** Ruta del storageState (absoluta o relativa al cwd). */
	storageStatePath: string;
	/** Origin del portal (ej. https://apps-uat.magiis.com). */
	origin: string;
	/** Carrier esperado: si la sesión es de otro carrier, falla antes de crear datos. */
	expectedCarrierId?: number;
	/** Vigencia mínima exigida al token, en ms. */
	minValidityMs?: number;
};

/**
 * Carga la sesión. Falla —sin imprimir valores— si el archivo falta, el origin no coincide,
 * faltan claves, el carrier no es el esperado o el JWT está vencido o por vencer.
 */
export function loadCarrierStorageSession(options: LoadCarrierStorageSessionOptions): CarrierStorageSession {
	const { storageStatePath: path, minValidityMs = 0 } = options;
	if (!existsSync(path)) {
		throw new Error(`[carrierStorageSession] no existe ${path}: sesión ausente; ${REGENERATE_HINT}`);
	}
	const origin = new URL(options.origin).origin;
	const state = JSON.parse(readFileSync(path, 'utf8')) as StorageStateFile;
	const entry = state.origins?.find(o => o.origin === origin);
	if (!entry) {
		throw new Error(`[carrierStorageSession] ${path} no tiene localStorage para ${origin}; ${REGENERATE_HINT}`);
	}

	const token = readItem(entry.localStorage, KEY_SESSION_TOKEN, path);
	const carrierId = readPositiveInt(readItem(entry.localStorage, KEY_USER_ID, path), KEY_USER_ID);
	if (options.expectedCarrierId !== undefined && carrierId !== options.expectedCarrierId) {
		throw new Error(
			`[carrierStorageSession] la sesión es del carrier ${carrierId}, se esperaba ${options.expectedCarrierId}`
		);
	}
	const tokenExpiresAt = readJwtExpiry(token);
	if (tokenExpiresAt.getTime() - Date.now() <= minValidityMs) {
		throw new Error(
			`[carrierStorageSession] sesión vencida o por vencer (exp ${tokenExpiresAt.toISOString()}); ${REGENERATE_HINT}`
		);
	}

	return new CarrierStorageSession(
		origin,
		carrierId,
		readPositiveInt(readItem(entry.localStorage, KEY_SUB_USER_ID, path), KEY_SUB_USER_ID),
		readItem(entry.localStorage, KEY_USER_ROL, path).replace(/^ROLE_/, ''),
		readItem(entry.localStorage, KEY_SUB_USER_NAME, path),
		tokenExpiresAt,
		token
	);
}

/** Tacha `Bearer …` y JWT sueltos de un texto antes de loguearlo o adjuntarlo. */
export function redactSecrets(text: string): string {
	return text
		.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redactado>')
		.replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, '<jwt-redactado>');
}

/**
 * Falla con status + cuerpo truncado y redactado si la respuesta no es 2xx. Un 401/403 es una
 * sesión rechazada: se dice explícitamente para que nadie intente "arreglarlo" con un login.
 */
export async function assertOkResponse(
	label: string,
	response: { status(): number; ok(): boolean; text(): Promise<string> }
): Promise<void> {
	const status = response.status();
	if (status === 401 || status === 403) {
		throw new Error(`[api] ${label} respondió ${status}: sesión rechazada; ${REGENERATE_HINT}`);
	}
	if (!response.ok()) {
		const body = redactSecrets(await response.text().catch(() => '<sin cuerpo>'));
		throw new Error(`[api] ${label} respondió ${status}: ${body.slice(0, 500)}`);
	}
}
