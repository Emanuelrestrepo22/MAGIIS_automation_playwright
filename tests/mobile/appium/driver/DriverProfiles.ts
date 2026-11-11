/**
 * Perfiles de chofer QA para el cierre de viaje por la app (W5b).
 *
 * Un perfil dice QUÉ variables de entorno traen la identidad del chofer y a qué carrier TEST
 * pertenece. NO contiene valores: las credenciales viven solo en el archivo de entorno
 * (`ENV_FILE`) o en la shell, y nunca se imprimen (solo se valida su presencia).
 *
 * Regla del repo: un chofer por dispositivo. El chofer del emulador no puede ser el que está
 * logueado en el teléfono físico a la vez.
 */

import type { DriverPreflightExpectation } from './DriverTripPreflight';

export type DriverProfileId = 'fr-1901' | 'test-default' | 'test-mp';

export type DriverProfile = {
	id: DriverProfileId;
	description: string;
	/** Carrier TEST esperado. `null` = no se asume (se toma el del handoff). */
	carrierId: number | null;
	emailKey: string;
	passwordKey: string;
	displayNameKey: string;
};

export const DRIVER_PROFILES: Record<DriverProfileId, DriverProfile> = {
	'fr-1901': {
		id: 'fr-1901',
		description: 'Chofer QA FR (carrier 1901 TEST)',
		carrierId: 1901,
		emailKey: 'DRIVER_EMAIL_FR',
		passwordKey: 'DRIVER_PASSWORD_FR',
		displayNameKey: 'DRIVER_DISPLAY_NAME_FR'
	},
	'test-default': {
		id: 'test-default',
		description: 'Chofer QA TEST por defecto (DRIVER_EMAIL/DRIVER_PASSWORD de .env.test); carrier = el del handoff',
		carrierId: null,
		emailKey: 'DRIVER_EMAIL',
		passwordKey: 'DRIVER_PASSWORD',
		displayNameKey: 'DRIVER_DISPLAY_NAME'
	},
	'test-mp': {
		id: 'test-mp',
		description: 'Chofer QA TEST de MercadoPago (DRIVER_EMAIL_MP/DRIVER_PASSWORD_MP); carrier = el del handoff',
		carrierId: null,
		emailKey: 'DRIVER_EMAIL_MP',
		passwordKey: 'DRIVER_PASSWORD_MP',
		displayNameKey: 'DRIVER_DISPLAY_NAME_MP'
	}
};

export function isDriverProfileId(v: string): v is DriverProfileId {
	return Object.prototype.hasOwnProperty.call(DRIVER_PROFILES, v);
}

export function getDriverProfile(id: string): DriverProfile {
	if (!isDriverProfileId(id)) {
		throw new Error(`Perfil de chofer desconocido "${id}". Disponibles: ${Object.keys(DRIVER_PROFILES).join(', ')}.`);
	}
	return DRIVER_PROFILES[id];
}

export type DriverProfileEnvCheck = { missing: string[] };

/** Nombra TODAS las claves faltantes, sin leer ni imprimir valores. */
export function checkDriverProfileEnv(profile: DriverProfile, env: NodeJS.ProcessEnv = process.env): DriverProfileEnvCheck {
	const keys = [profile.emailKey, profile.passwordKey, profile.displayNameKey];
	return { missing: keys.filter(k => !env[k]?.trim()) };
}

/**
 * Arma el pre-flight del chofer del perfil. `credentials` viaja en la expectativa y solo se usa si la
 * app está deslogueada; nunca se loguea. Lanza (fail-fast) nombrando las claves que faltan.
 */
export function readDriverPreflightExpectation(
	profile: DriverProfile,
	appPackage: string,
	expectedTravelId?: number,
	env: NodeJS.ProcessEnv = process.env
): DriverPreflightExpectation {
	const { missing } = checkDriverProfileEnv(profile, env);
	if (missing.length > 0) {
		throw new Error(
			`Perfil ${profile.id}: faltan variables ${missing.join(', ')}. ` +
				'Definilas en el archivo de entorno (ENV_FILE) o en la shell; no se imprimen sus valores.'
		);
	}
	return {
		appPackage,
		driverDisplayName: env[profile.displayNameKey]!.trim(),
		credentials: { email: env[profile.emailKey]!.trim(), password: env[profile.passwordKey]!.trim() },
		...(expectedTravelId !== undefined ? { expectedTravelId } : {})
	};
}
