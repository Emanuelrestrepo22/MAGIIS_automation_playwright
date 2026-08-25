/**
 * Resolución del OBJETIVO de una corrida móvil: ambiente + paquete de la app.
 *
 * POR QUÉ EXISTE. Los scripts de MG-117 resolvían el paquete con un literal propio:
 *
 *     const APP_PACKAGE = process.env.ANDROID_DRIVER_APP_PACKAGE ?? 'com.magiis.app.test.driver';
 *
 * Con eso, `ENV=uat` es INERTE: la corrida abre la app de **test** mientras el reporte dice UAT.
 * Es la peor clase de falso verde — evidencia real atribuida al ambiente equivocado, que es
 * indistinguible de evidencia buena salvo que alguien mire el paquete a mano.
 *
 * Este helper cierra esa puerta:
 *   · `ENV` selecciona el paquete desde el mapa canónico de `appiumRuntime`.
 *   · Un `ENV` desconocido FALLA en vez de caer a test en silencio.
 *   · `describe()` devuelve la línea que cada script DEBE loguear al arrancar: una corrida que no
 *     declara contra qué ambiente corrió no es evidencia auditable.
 */

import { getMobileEnvFile, loadMobileEnvFile } from '../../config/mobileEnvFile';

// El archivo del ambiente se aplica al importar. Sin esto, `.env.uat` era decorativo: la capa
// móvil nunca cargaba dotenv y todo dependía de lo exportado a mano en la terminal.
loadMobileEnvFile();

/** Paquetes por ambiente y actor. Espejo del mapa de `config/appiumRuntime.ts`. */
const APP_PACKAGES = {
	test: { driver: 'com.magiis.app.test.driver', passenger: 'com.magiis.app.test.passenger' },
	uat: { driver: 'com.magiis.app.uat.driver', passenger: 'com.magiis.app.uat.passenger' },
	prod: { driver: 'com.magiis.app.driver', passenger: 'com.magiis.app.passenger' }
} as const;

export type MobileEnv = keyof typeof APP_PACKAGES;
export type MobileActor = 'driver' | 'passenger';

export type DriverTarget = {
	env: MobileEnv;
	actor: MobileActor;
	appPackage: string;
	udid: string;
	appiumUrl: string;
	/** true si el paquete vino de un override explícito y no del mapa por ambiente. */
	overridden: boolean;
};

function resolveEnv(): MobileEnv {
	const raw = (process.env.ENV ?? 'test').trim().toLowerCase();
	if (raw in APP_PACKAGES) return raw as MobileEnv;
	// Fallar es deliberado: un typo (`uta`, `UAT2`) que cayera a `test` produciría una corrida
	// verde contra el ambiente equivocado, que es exactamente lo que este módulo previene.
	throw new Error(
		`ENV="${process.env.ENV}" no es un ambiente válido. Usá uno de: ${Object.keys(APP_PACKAGES).join(' | ')}.`
	);
}

/**
 * Lee la primera variable presente de la lista y falla nombrando el archivo del ambiente activo.
 * El error dice QUÉ falta y DÓNDE ponerlo — un `undefined` silencioso acá se manifiesta después
 * como un timeout de Appium sin causa aparente.
 */
function readRequiredEnv(names: string[], what: string): string {
	for (const name of names) {
		const value = process.env[name]?.trim();
		if (value) return value;
	}
	throw new Error(
		`Falta ${names.join(' o ')} — ${what}. ` + `Definilo en ${getMobileEnvFile()} (o exportalo en la terminal).`
	);
}

/** Se declara una sola vez por proceso, aunque varios módulos pidan el objetivo. */
let announced = false;

export function resolveDriverTarget(actor: MobileActor = 'driver'): DriverTarget {
	const env = resolveEnv();
	const key = actor === 'driver' ? 'ANDROID_DRIVER_APP_PACKAGE' : 'ANDROID_PASSENGER_APP_PACKAGE';
	const override = process.env[key]?.trim();
	const fromMap = APP_PACKAGES[env][actor];

	if (override && override !== fromMap) {
		// No se bloquea —hay casos legítimos, como un build de marca blanca— pero se avisa fuerte:
		// un override que contradice el ambiente es la firma de una corrida mal etiquetada.
		console.warn(
			`[target] AVISO: ${key}="${override}" contradice ENV=${env} (esperado "${fromMap}"). ` +
				'La evidencia quedará atribuida al paquete del override, no al del ambiente.'
		);
	}

	const target: DriverTarget = {
		env,
		actor,
		appPackage: override || fromMap,
		// Rol primero, genérica después. Sin default hardcodeado: un UDID literal en el código hacía
		// que una corrida apuntara siempre al mismo teléfono aunque el operador creyera estar
		// corriendo en otro, y sobrevivía a cualquier cambio de `.env.*` sin dejar rastro.
		udid: readRequiredEnv(
			[`ANDROID_${actor.toUpperCase()}_UDID`, 'ANDROID_UDID'],
			'el dispositivo Android contra el que corre la sesión (adb devices)'
		),
		appiumUrl: readRequiredEnv(['APPIUM_SERVER_URL'], 'la URL del servidor Appium (ej: http://localhost:4723)'),
		// Sólo es "override" si CONTRADICE al mapa. Declarar el mismo paquete que ya resuelve `ENV`
		// no es un override, y marcarlo como tal diluye la señal: la etiqueta dejaría de distinguir
		// la corrida sospechosa (marca blanca, build ad hoc) de la corrida normal.
		overridden: Boolean(override) && override !== fromMap
	};

	// La declaración se emite DESDE ACÁ, no desde cada script: si dependiera de que cada uno se
	// acuerde de loguearla, el que se olvide produce evidencia sin ambiente declarado — que es
	// indistinguible de evidencia correcta hasta que alguien la audita.
	if (!announced) {
		announced = true;
		console.log(`[target] ${describe(target)}`);
	}

	return target;
}

/** Línea de cabecera obligatoria: declara contra qué corrió la evidencia. */
export function describe(t: DriverTarget): string {
	return (
		`OBJETIVO -> env=${t.env}  package=${t.appPackage}  udid=${t.udid}` +
		(t.overridden ? '  (paquete por override explícito)' : '')
	);
}
