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
		udid: process.env.ANDROID_UDID?.trim() || 'R92XB0B8F3J',
		appiumUrl: process.env.APPIUM_SERVER_URL?.trim() || 'http://localhost:4723',
		overridden: Boolean(override)
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
