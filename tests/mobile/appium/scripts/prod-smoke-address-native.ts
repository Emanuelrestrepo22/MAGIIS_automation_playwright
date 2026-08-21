/**
 * SMOKE en PRODUCCION del campo de direcciones de App PAX — instrumentacion NATIVA.
 *
 * POR QUE NATIVO Y NO CON CAPTURA DE RED. El build de produccion no expone el WebView a devtools:
 * `getContexts()` devuelve solo `["NATIVE_APP"]` (medido el 2026-08-21 contra
 * com.magiis.app.ateg.passenger v2.5.19). Sin contexto web no se puede inyectar
 * `installWebViewNetworkCapture`, asi que TODA conducta cuyo aserto sea un request es INMEDIBLE en
 * prod. Lo que si queda es el arbol de accesibilidad, que Android expone igual: alcanza para leer la
 * lista de predicciones tal como la VE el usuario.
 *
 * QUE ACREDITA, y con que fuerza — la distincion importa y hay que respetarla al adjuntar evidencia:
 *   · ORDEN de las predicciones (TM-727): aserto DIRECTO. El defecto es que aeropuertos lejanos
 *     rankeen sobre direcciones cercanas, y eso se ve en la lista sin panel de red.
 *   · PISO de caracteres (TM-681, TM-680): aserto INDIRECTO. Nativamente se observa "aparecen
 *     predicciones", no "salio un request". Es el resultado de cara al usuario, no el aserto tecnico
 *     del caso. Hay que declararlo asi en la evidencia y NO cerrar el caso como si se hubiera medido
 *     la red.
 *   · "cero llamadas a Google" (TM-674): NO acreditable aca de ninguna forma. Requiere ver la red.
 *
 * NO crea viajes, NO guarda direcciones, NO toca la wallet: escribe en el campo, lee la lista y
 * saca capturas. El unico efecto es texto tipeado en un campo, que se limpia al final.
 *
 * Uso:
 *   ENV=prod ANDROID_PASSENGER_APP_PACKAGE=com.magiis.app.ateg.passenger \
 *   ANDROID_UDID=<udid> APPIUM_SERVER_URL=http://localhost:4723 \
 *   node --loader ts-node/esm tests/mobile/appium/scripts/prod-smoke-address-native.ts
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { remote } from 'webdriverio';

import { resolveDriverTarget } from './_shared/resolveDriverTarget';

type Driver = Awaited<ReturnType<typeof remote>>;
/** Elemento ya resuelto: `$$` devuelve encadenables, y al indexarlos se obtiene este tipo. */
type AppElement = Awaited<ReturnType<Driver['$']>>;

const TARGET = resolveDriverTarget('passenger');
const OUT_DIR = path.join('evidence', 'prod', 'mg116-smoke');
const SETTLE_MS = 3200;

const log = (m: string): void => console.log(`[smoke] ${m}`);

/** Filas de la lista de predicciones, leidas del arbol nativo en el orden en que se muestran. */
function extractPredictions(source: string): string[] {
	const filas: string[] = [];
	// Las predicciones se renderizan como nodos con texto por debajo del campo editable. Se toman
	// los textos "largos" (una direccion nunca es una etiqueta de 2 palabras de menu) y se descartan
	// los controles conocidos de la pantalla, que son estables.
	const RUIDO = new Set([
		'image',
		'trash',
		'chevron back outline',
		'chevron forward outline',
		'Solo Ida',
		'Ida y Vuelta',
		'A Disposición',
		'Ahora',
		'Seleccionar Vehículo',
		'home Inicio',
		'list Actividad',
		'call Llamar',
		'Llamar',
		'person circle outline Mi cuenta',
		'Mi cuenta',
		'Viaje Favorito',
		'Llevame a Casa',
		'TRF In Airpot',
		'TRF Out Port',
		'Mensajería',
		'Mis Direcciones chevron down',
		'Últimos Destinos chevron down',
		// Etiquetas que dependen de la CONFIGURACION del usuario/carrier, no de la pantalla. Aparecen
		// como accesos rapidos y contaminaban el conteo de predicciones (medido en prod el 2026-08-21:
		// inflaban cada resultado en +3). Si aparece un acceso rapido nuevo, hay que sumarlo aca.
		'Modo Personal',
		'Modo Business',
		'Prueba Fer',
		'Doctor Dr.',
		'Dest Fijo'
	]);

	for (const m of source.matchAll(/text="([^"]{6,})"/g)) {
		const t = m[1].trim();
		if (!t || RUIDO.has(t)) continue;
		if (!filas.includes(t)) filas.push(t);
	}
	return filas;
}

async function screenshot(driver: Driver, nombre: string): Promise<string> {
	fs.mkdirSync(OUT_DIR, { recursive: true });
	const ruta = path.join(OUT_DIR, `${nombre}.png`);
	const b64 = await driver.takeScreenshot();
	fs.writeFileSync(ruta, Buffer.from(b64, 'base64'));
	log(`   captura -> ${ruta}`);
	return ruta;
}

/** Marcadores estables de la pantalla de alta de viaje. */
const MARCAS_ALTA_VIAJE = ['Solo Ida', 'Ida y Vuelta', 'Seleccionar Veh'];
/** Marcadores de la pantalla de login. Si aparecen, NO se toca ningun campo. */
const MARCAS_LOGIN = ['Ingresar', 'Olvidaste tu Contrase', 'Bienvenido'];

/**
 * Verifica en que pantalla esta la app ANTES de tocar cualquier campo.
 *
 * POR QUE EXISTE — un error real, cometido el 2026-08-21. La primera version de este script tomaba
 * "el segundo EditText" sin mirar la pantalla. El operador estaba haciendo logout para cambiar de un
 * usuario PRODUCTIVO a uno de pruebas, la app quedo en el login, y el script tipeo los terminos de
 * busqueda DENTRO DEL FORMULARIO DE LOGIN de una app de produccion. No se envio ninguna credencial
 * (nunca se toco "Ingresar" y lo tipeado no era una password), pero un script que asume el estado en
 * vez de verificarlo no tiene lugar apuntando a produccion.
 */
async function verificarPantalla(driver: Driver): Promise<{ ok: boolean; motivo: string }> {
	const fuente = await driver.getPageSource();

	const enLogin = MARCAS_LOGIN.filter(m => fuente.includes(m));
	if (enLogin.length >= 2) {
		return { ok: false, motivo: `la app esta en la PANTALLA DE LOGIN (marcas: ${enLogin.join(', ')}). No se toca ningun campo.` };
	}

	const faltantes = MARCAS_ALTA_VIAJE.filter(m => !fuente.includes(m));
	if (faltantes.length > 0) {
		return { ok: false, motivo: `no se reconoce la pantalla de alta de viaje (faltan marcas: ${faltantes.join(', ')}).` };
	}

	const campos = await driver.$$('//android.widget.EditText');
	const total = await campos.length;
	if (total < 2) {
		return { ok: false, motivo: `se esperaban 2 campos de direccion (origen + destino) y hay ${total}.` };
	}

	return { ok: true, motivo: `pantalla de alta de viaje confirmada, ${total} campos editables` };
}

/** El campo de destino: el segundo EditText, ya con la pantalla verificada por el llamador. */
async function findDestinationField(driver: Driver): Promise<AppElement | null> {
	const campos = await driver.$$('//android.widget.EditText');
	const total = await campos.length;
	if (total < 2) return null;
	return campos[1];
}

/** Version instalada del paquete, para que la evidencia diga contra que build se midio. */
function versionInstalada(paquete: string): string {
	try {
		const out = execSync(`adb shell dumpsys package ${paquete}`, { encoding: 'utf8', timeout: 30000 });
		const v = /versionName=([^\s]+)/.exec(out)?.[1] ?? '?';
		const c = /versionCode=([0-9]+)/.exec(out)?.[1] ?? '?';
		return `${v} (versionCode ${c})`;
	} catch {
		return '(no se pudo leer)';
	}
}

async function medirTermino(driver: Driver, campo: AppElement, termino: string, etiqueta: string): Promise<{ termino: string; filas: string[]; captura: string }> {
	log(`termino "${termino}"`);
	await campo.click();
	await driver.pause(600);
	await campo.clearValue().catch(() => undefined);
	await driver.pause(400);
	await campo.setValue(termino);
	await driver.pause(SETTLE_MS);

	const source = await driver.getPageSource();
	const filas = extractPredictions(source);
	log(`   predicciones leidas: ${filas.length}`);
	filas.forEach((f, i) => log(`     ${String(i + 1).padStart(2)}. ${f.slice(0, 78)}`));

	const captura = await screenshot(driver, `${etiqueta}-${termino}`);
	return { termino, filas, captura };
}

async function main(): Promise<void> {
	const versionApp = versionInstalada(TARGET.appPackage);
	log(`ambiente=${TARGET.env}  paquete=${TARGET.appPackage}  version=${versionApp}  udid=${TARGET.udid}`);
	log('NO se crean viajes ni se guardan direcciones: solo se escribe en el campo y se lee la lista.');

	const url = new URL(TARGET.appiumUrl);
	const driver = await remote({
		hostname: url.hostname,
		port: Number(url.port || 4723),
		path: '/',
		logLevel: 'error',
		capabilities: {
			platformName: 'Android',
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'appium:automationName': 'UiAutomator2',
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'appium:udid': TARGET.udid,
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'appium:appPackage': TARGET.appPackage,
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'appium:appActivity': '.MainActivity',
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'appium:noReset': true,
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'appium:forceAppLaunch': true,
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'appium:newCommandTimeout': 240
		}
	});

	const resultados: { termino: string; filas: string[]; captura: string }[] = [];

	try {
		await driver.pause(9000);
		await screenshot(driver, '00-pantalla-inicial');

		const chequeo = await verificarPantalla(driver);
		log(`pantalla: ${chequeo.motivo}`);
		if (!chequeo.ok) {
			log('ABORTA sin tocar nada. Esto NO es un defecto del producto: es una precondicion no cumplida.');
			return;
		}

		const campo = await findDestinationField(driver);
		if (!campo) {
			log('NO se encontro campo de direccion editable. Se aborta sin concluir nada del producto.');
			return;
		}

		// Barrido del piso de caracteres: cuando aparecen las primeras predicciones. Aserto INDIRECTO
		// (se ve la lista, no el request) — declarado asi en el reporte.
		for (const t of ['co', 'cor', 'corr']) {
			resultados.push(await medirTermino(driver, campo, t, '01-piso'));
		}

		// El caso de orden (TM-727): aserto DIRECTO, el ranking se ve en la lista.
		resultados.push(await medirTermino(driver, campo, 'corrientes', '02-orden'));

		// Prefijo de aeropuerto con 3 caracteres: la rama IATA del backend.
		resultados.push(await medirTermino(driver, campo, 'eze', '03-iata'));

		// Dejar el campo como estaba: este smoke no persiste nada.
		await campo.clearValue().catch(() => undefined);
		await screenshot(driver, '99-campo-limpio');
	} finally {
		await driver.deleteSession().catch(() => undefined);
	}

	// Resumen legible + JSON, para adjuntar como evidencia en Xray.
	fs.mkdirSync(OUT_DIR, { recursive: true });
	const resumen = {
		cuando: new Date().toISOString(),
		ambiente: TARGET.env,
		paquete: TARGET.appPackage,
		versionApp,
		udid: TARGET.udid,
		limitacion: 'Build de produccion sin WebView depurable: getContexts() = ["NATIVE_APP"]. Sin captura de red, los asertos de request son INMEDIBLES aca. Lo de abajo es lo observable en pantalla.',
		resultados
	};
	const jsonPath = path.join(OUT_DIR, 'resumen.json');
	fs.writeFileSync(jsonPath, JSON.stringify(resumen, null, 2), 'utf8');

	log('');
	log('='.repeat(88));
	log('RESUMEN');
	for (const r of resultados) {
		log(`  "${r.termino}" -> ${r.filas.length} predicciones`);
	}
	log(`  resumen JSON -> ${jsonPath}`);
	log('='.repeat(88));
}

main().catch((e: Error) => {
	console.error(`[smoke] error: ${e.message}`);
	process.exit(1);
});
