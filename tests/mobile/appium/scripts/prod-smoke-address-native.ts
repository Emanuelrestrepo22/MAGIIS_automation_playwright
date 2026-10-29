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
// Carpeta POR CORRIDA: el A/B de carrier hace dos mediciones que hay que comparar, y un unico
// directorio hacia que la segunda sobreescribiera la primera — perdiendo justo la mitad que da
// sentido a la comparacion. La etiqueta se pasa por MG116_CARRIER_LABEL.
const SLUG = (process.env.MG116_CARRIER_LABEL ?? 'sin-etiqueta')
	.toLowerCase()
	.replace(/[^a-z0-9]+/g, '-')
	.replace(/^-|-$/g, '');
const OUT_DIR = path.join('evidence', 'prod', `mg116-smoke-${SLUG}`);
const SETTLE_MS = 3200;

const log = (m: string): void => console.log(`[smoke] ${m}`);

/** Filas de la lista de predicciones, leidas del arbol nativo en el orden en que se muestran. */
function extractPredictions(source: string, excluir: string[] = []): string[] {
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
		'Dest Fijo',
		'Airport',
		'Desti Abierto',
		'Pru.Fer.Prod'
	]);

	// El valor del campo ORIGEN vive en su propio EditText y aparece en el arbol como texto: no es
	// una prediccion. Se excluye dinamicamente en vez de por lista fija, porque cambia por usuario.
	for (const m of source.matchAll(/text="([^"]{6,})"/g)) {
		const t = m[1].trim();
		if (!t || RUIDO.has(t)) continue;
		if (excluir.some(e => e && (t === e || t.startsWith(e.slice(0, 24))))) continue;
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
 * Cierra el dialogo de permisos del sistema si esta presente. POR ELEMENTO, nunca por coordenada.
 *
 * POR QUE EXISTE, y por que NO usa coordenadas — incidente del 2026-08-21. Al actualizar la app a
 * v2.5.19 Android volvio a pedir el permiso de notificaciones. Se leyeron las coordenadas del boton
 * "No permitir" de un `uiautomator dump` y se ejecuto un `adb input tap` con ellas. Entre el dump y
 * el tap el dialogo ya se habia cerrado, asi que esas coordenadas cayeron sobre lo que habia debajo:
 * el boton "Llamar" de la barra inferior, que INICIO UNA LLAMADA SALIENTE REAL al numero del carrier.
 * Se corto de inmediato y el registro del dispositivo confirma `duration=0` — sono sin conectarse.
 *
 * Un tap por coordenada golpea lo que este ahi. Un tap por elemento falla si el elemento no existe.
 * Esa es toda la diferencia, y es la razon de que este helper busque el texto en vez de una posicion.
 *
 * Se elige NO PERMITIR: no concede capacidades nuevas a una app de produccion y es reversible desde
 * Ajustes. Nunca se toca "Permitir".
 */
async function tocarPorTexto(driver: Driver, texto: string): Promise<boolean> {
	const el = await driver.$(`//*[@text="${texto}"]`);
	if (!(await el.isExisting().catch(() => false))) return false;
	await el.click().catch(() => undefined);
	await driver.pause(1800);
	return true;
}

/**
 * Atiende los dialogos de permisos del sistema. Cada uno se responde distinto A PROPOSITO.
 *
 * NOTIFICACIONES -> "No permitir". La suite no necesita notificaciones, y no se conceden
 * capacidades nuevas a una app de produccion sin motivo.
 *
 * UBICACION -> "Solo esta vez", con precision "Precisa". Aca SI hace falta conceder: el fix que se
 * esta validando consiste en que el sesgo salga de la posicion del DISPOSITIVO, y sin permiso de
 * ubicacion la app no tiene esa coordenada — el test no podria medir nada. Se elige la opcion de
 * una sola vez porque se AUTO-REVOCA al cerrar la app, en vez de dejar un permiso persistente. Y
 * "Precisa" porque una ubicacion aproximada moveria el sesgo y contaminaria la medicion.
 *
 * Se llama antes de cada medicion, no solo al arranque: la actualizacion de la app resetea los
 * permisos y Android los pide de a uno, apareciendo a mitad de la corrida. La primera version de
 * este script lo llamaba una sola vez y el segundo dialogo la hizo caer con "0 elements".
 */
async function atenderDialogosDePermisos(driver: Driver): Promise<string> {
	const atendidos: string[] = [];

	for (let ronda = 0; ronda < 4; ronda++) {
		const fuente = await driver.getPageSource().catch(() => '');
		if (!fuente.includes('permissioncontroller')) break;

		if (fuente.includes('ubicaci') || fuente.toLowerCase().includes('location')) {
			// Precision primero: el boton de duracion aplica la precision que este seleccionada.
			await tocarPorTexto(driver, 'Precisa');
			const ok =
				(await tocarPorTexto(driver, 'Solo esta vez')) || (await tocarPorTexto(driver, 'Only this time'));
			atendidos.push(ok ? 'ubicacion: solo esta vez (precisa)' : 'ubicacion: NO se pudo responder');
			if (!ok) break;
			continue;
		}

		let ok = false;
		for (const texto of ['No permitir', "Don't allow", 'Deny']) {
			if (await tocarPorTexto(driver, texto)) {
				ok = true;
				atendidos.push(`otro permiso: ${texto}`);
				break;
			}
		}
		if (!ok) break;
	}

	return atendidos.length ? atendidos.join(' | ') : 'no habia dialogos de permisos';
}

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
		return {
			ok: false,
			motivo: `la app esta en la PANTALLA DE LOGIN (marcas: ${enLogin.join(', ')}). No se toca ningun campo.`
		};
	}

	const faltantes = MARCAS_ALTA_VIAJE.filter(m => !fuente.includes(m));
	if (faltantes.length > 0) {
		return {
			ok: false,
			motivo: `no se reconoce la pantalla de alta de viaje (faltan marcas: ${faltantes.join(', ')}).`
		};
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

async function medirTermino(
	driver: Driver,
	campo: AppElement,
	termino: string,
	etiqueta: string
): Promise<{ termino: string; filas: string[]; captura: string }> {
	log(`termino "${termino}"`);
	// Los permisos se piden de a uno y aparecen a mitad de la corrida: hay que atenderlos antes de
	// cada medicion, no solo al arranque.
	const perm = await atenderDialogosDePermisos(driver);
	if (perm !== 'no habia dialogos de permisos') log(`   permisos: ${perm}`);
	await campo.click();
	await driver.pause(600);
	await campo.clearValue().catch(() => undefined);
	await driver.pause(400);
	await campo.setValue(termino);
	await driver.pause(SETTLE_MS);

	const source = await driver.getPageSource();
	// Se lee el ORIGEN para excluirlo: es el otro EditText de la pantalla, no una prediccion.
	const campos = await driver.$$('//android.widget.EditText');
	const origen = (await campos.length) > 0 ? await campos[0].getText().catch(() => '') : '';
	const filas = extractPredictions(source, [origen, termino]);
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

		log(`permisos: ${await atenderDialogosDePermisos(driver)}`);
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

		// Los terminos son configurables para poder repetir la MISMA medicion cambiando una variable
		// del entorno — que es lo que hace posible el A/B de carrier sin editar codigo.
		//
		// ELECCION DE TERMINOS, y por que importa. Los defaults anteriores (`cor`, `corr`, `eze`)
		// caen todos en la rama de AEROPUERTOS y match por nombre del backend: `cor` devuelve
		// Cordoba por su codigo IATA, `corr` devuelve aeropuertos en Italia y Australia por nombre.
		// Ninguno prueba PROXIMIDAD. Para discriminar si el sesgo es el dispositivo hacen falta
		// terminos que devuelvan CALLES CERCANAS: en UAT, `corri` con 5 caracteres hacia desaparecer
		// los aeropuertos y devolvia Av. Corrientes a 350 m del usuario.
		const terminos = (process.env.MG116_TERMS ?? 'corri,reconqu,arenal,corr,eze')
			.split(',')
			.map(t => t.trim())
			.filter(Boolean);
		log(`terminos a medir: ${terminos.join(' · ')}`);

		for (const [i, t] of terminos.entries()) {
			resultados.push(await medirTermino(driver, campo, t, `${String(i + 1).padStart(2, '0')}-termino`));
		}

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
		carrier: process.env.MG116_CARRIER_LABEL ?? '(no declarado)',
		udid: TARGET.udid,
		limitacion:
			'Build de produccion sin WebView depurable: getContexts() = ["NATIVE_APP"]. Sin captura de red, los asertos de request son INMEDIBLES aca. Lo de abajo es lo observable en pantalla.',
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
