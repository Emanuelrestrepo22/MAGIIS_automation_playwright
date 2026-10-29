/**
 * MG-116 — matriz de consistencia de los campos de dirección de App PAX, como suite trazada.
 *
 * QUÉ CUBRE Y POR QUÉ ASÍ
 * MG-116 no cambió una pantalla: cambió *cómo autocompleta una dirección*. App PAX monta ese campo
 * en varias superficies y cada una tuvo implementación propia, así que el riesgo real no es "el
 * autocompletado no funciona" sino que **funcione distinto en cada lugar**. Por eso la suite es una
 * matriz conducta × superficie y no una lista de casos: agregar una superficie cuesta una fila.
 *
 * POR QUÉ LA TRAZA VA POR FILA Y NO POR CONDUCTA
 * El `xray-reporter` deduplica por `testKey` y **gana el peor estado**. Si TM-678 (debounce) se
 * trazara a las cinco superficies, la fila roja de Mis Direcciones lo marcaría FAILED — cuando en el
 * flujo de viaje el debounce sí opera. Cada caso recibe el estado de las superficies que realmente
 * cubre, y por eso las dos conductas propias de Mis Direcciones necesitaron ID propio (TM-733,
 * TM-734).
 *
 * TM-734 YA NO ES UN DEFECTO, y la fila lo refleja. Se creó el 2026-08-19 esperando el piso de 3 del
 * AC en Perfil › Direcciones, pero ese piso existe PARA soportar códigos IATA y ahí no hay caso de
 * uso de aeropuerto: nadie guarda uno como Casa o Trabajo. El 2026-08-20 se acordó que en esa
 * pantalla el piso es 4, y la fila ahora asierta 4 ahí y 3 en el resto. El producto nunca estuvo
 * roto; la expectativa del test estaba mal escrita.
 *
 * POR QUÉ SE RELANZA LA APP ANTES DE CADA SUPERFICIE
 * `reach()` navega DESDE el home. La superficie anterior puede dejar la app metida en una página sin
 * barra de tabs (Perfil › Direcciones es el caso), y entonces la navegación de la siguiente no
 * encuentra su punto de partida: `reach()` da `false` y las conductas se saltan con motivo, sobre un
 * producto sano. Relanzar la app devuelve el punto de partida sin abrir una sesión Appium nueva —
 * nueve sesiones tiraban abajo el UiAutomator2 de este teléfono. Ver `relaunchApp`.
 *
 * POR QUÉ SE RE-ESTABLECE LA SUPERFICIE ANTES DE CADA CONDUCTA
 * Medido el 2026-08-19: correr las seis conductas seguidas en una sesión dejaba el campo de Perfil ›
 * Mis Direcciones sin aceptar texto tras el primer chequeo, y tres conductas salían SIN_DATOS que en
 * sesión aislada medían bien. Re-navegar antes de cada conducta es lo que la sesión aislada lograba,
 * sin pagar una sesión Appium por test.
 *
 * DISCIPLINA DE VEREDICTO
 * Superficie inalcanzable ⇒ `test.skip()` con motivo escrito, **jamás un rojo**. Cero requests nunca
 * es PASS: el probe lo reporta `SIN_DATOS` y acá se traduce a skip, no a falla. El mensaje de cada
 * assertion lleva el valor MEDIDO, para que el reporte de Allure sea auditable sin abrir el JSON.
 *
 * EJECUCIÓN
 *   ENV=uat APPIUM_SERVER_URL=http://localhost:4723 npx playwright test pax-address-behaviors --workers=1
 *   Con reporte:  ALLURE=1 XRAY=1 pnpm run test:uat:mg116:behaviors
 *
 * PRECONDICIONES. App PAX logueada (`noReset: true`). S6 necesita al menos un viaje programado
 * (fixture 1396-MA, creado con Cuenta Corriente). La suite NO crea viajes, NO guarda direcciones y
 * NO toca la wallet: escribe en el campo y mide.
 */

import { test, expect } from '@playwright/test';
import { remote } from 'webdriverio';
import { resolveDriverTarget } from '../../scripts/_shared/resolveDriverTarget';
import { AddressFieldProbe, type AddressSurface, type BehaviorVerdict } from '../AddressFieldProbe';
import { installWebViewNetworkCapture } from '../../helpers/webViewNetworkCapture';
import { ensurePassengerSession } from '../ensurePassengerSession';
import {
	HomeOriginSurface,
	HomeStopSurface,
	ProfileAddressSurface,
	ScheduledTripEditSurface,
	TripTypeAddressSurface
} from '../surfaces/homeSurfaces';

const TARGET = resolveDriverTarget('passenger');
const SEED_DESTINATION = process.env.MG116_SEED_DESTINATION ?? 'Arenales 1233';

type Driver = Awaited<ReturnType<typeof remote>>;

/** Una conducta a medir sobre una superficie, con los casos de Xray que acredita. */
type BehaviorRow = {
	/** Título del test, sin el prefijo de superficie. */
	title: string;
	/** Casos de Xray que esta fila acredita. El reporter recoge todos los distintos. */
	tms: string[];
	run: (probe: AddressFieldProbe, selector: string) => Promise<BehaviorVerdict>;
	/** Aserción extra sobre el dato medido, cuando la fila acredita más de un caso. */
	assertMeasured?: (measured: Record<string, unknown>) => void;
};

/**
 * El request lleva el término y el sesgo de ubicación (TM-675).
 *
 * Se asierta sobre la MISMA medición que la conducta del canal en vez de repetir el tipeo: es el
 * mismo request capturado, mirado por otro lado. Repetirlo costaría una consulta más sin agregar
 * información.
 */
function assertRequestCarriesParams(measured: Record<string, unknown>): void {
	const urls = (measured.autocompleteUrls as string[] | undefined) ?? [];
	expect(urls.length, 'sin URLs capturadas no se puede verificar qué parámetros viajan').toBeGreaterThan(0);
	const url = urls[0];
	expect(url, `el request debe llevar el término buscado — URL medida: ${url}`).toMatch(/[?&]address=/);
	expect(url, `el request debe llevar el sesgo de ubicación — URL medida: ${url}`).toMatch(/[?&]latitude=/);
	expect(url, `el request debe llevar el sesgo de ubicación — URL medida: ${url}`).toMatch(/[?&]longitude=/);
}

/**
 * Las conductas comunes a toda superficie con campo de dirección.
 *
 * `tripFlow` distingue las superficies del alta de viaje de Perfil › Mis Direcciones: son las mismas
 * conductas, pero acreditan casos distintos porque Mis Direcciones falla en dos de ellas y el
 * reporter dedup­lica por el peor estado.
 */
function commonRows(tripFlow: boolean): BehaviorRow[] {
	return [
		{
			title: 'consulta el endpoint propio, cero a Google, y el request lleva término y sesgo',
			tms: ['TM-674', 'TM-675'],
			run: (probe, sel) => probe.checkOwnEndpoint(sel),
			assertMeasured: assertRequestCarriesParams
		},
		{
			title: 'agrupa las pulsaciones antes de consultar',
			tms: tripFlow ? ['TM-678'] : ['TM-733'],
			run: (probe, sel) => probe.checkDebounce(sel)
		},
		{
			// El piso es POR SUPERFICIE, no global. Reclasificado el 2026-08-20: el AC de MG-116 fija 3
			// para los campos del alta de viaje, donde un código IATA de 3 letras es caso de uso real.
			// Perfil › Direcciones acordó 4 — es un formulario de guardado y nadie guarda un aeropuerto
			// como Casa o Trabajo. Antes esta fila esperaba 3 en las dos y marcaba rojo un
			// comportamiento correcto: el defecto estaba en el test, no en el producto.
			title: tripFlow
				? 'respeta el piso de 3 caracteres del AC'
				: 'respeta el piso de 4 caracteres acordado para esta pantalla',
			tms: tripFlow ? ['TM-680', 'TM-681'] : ['TM-734'],
			run: (probe, sel) => probe.checkMinLength(sel, { expectedFloor: tripFlow ? 3 : 4 })
		},
		{
			title: 'no reconsulta un texto idéntico',
			tms: ['TM-679'],
			run: (probe, sel) => probe.checkDistinctUntilChanged(sel)
		},
		{
			title: 'los requests del mismo campo comparten un único sessionToken',
			tms: ['TM-686'],
			run: (probe, sel) => probe.checkSessionToken(sel)
		}
	];
}

/**
 * Conductas que sólo se ejercen en UNA superficie.
 *
 * No se repiten en las cinco a propósito: la rotación del token, la degradación del endpoint y la
 * caída de red son conductas del componente, no de la pantalla. Medirlas cinco veces multiplicaría
 * el tiempo de corrida sin agregar señal — y el objeto de esta suite es la CONSISTENCIA entre
 * superficies, que se establece con las conductas comunes.
 */
const SINGLE_SURFACE_ROWS: BehaviorRow[] = [
	{
		title: 'el sessionToken rota al seleccionar una predicción',
		tms: ['TM-687'],
		run: (probe, sel) => probe.checkTokenRotation(sel)
	},
	{
		title: 'el campo sobrevive a un 5xx del endpoint',
		tms: ['TM-689'],
		run: (probe, sel) => probe.checkDegradedResponse(sel, 'status')
	},
	{
		title: 'el campo sobrevive a un timeout del endpoint',
		tms: ['TM-689'],
		run: (probe, sel) => probe.checkDegradedResponse(sel, 'timeout')
	},
	{
		title: 'el campo sigue usable sin conexión',
		tms: ['TM-697'],
		run: (probe, sel) => probe.checkOfflineUsable(sel)
	}
];

type SurfaceDef = {
	id: string;
	label: string;
	make: () => AddressSurface;
	/** Superficies del flujo de alta de viaje. Perfil › Mis Direcciones NO lo es. */
	tripFlow: boolean;
	/** Las conductas de una sola superficie corren acá. */
	carriesSingleSurfaceRows?: boolean;
};

/**
 * S2 (Home · Destino) y S4 (Ida y Vuelta) quedan FUERA a propósito, no por olvido:
 *   S2 — el home mantiene UNA fila de dirección editable y cuál es depende del estado en que quedó
 *        la app; las tres filas son el mismo componente (`name="input-from"`). Medirla como
 *        superficie fija reporta SIN_DATOS con el producto sano. La fila activa se mide igual, vía
 *        S1/S3/S5, y el reporte dice cuál se usó.
 *   S4 — el botón de tipo de viaje no queda `active` cuando el panel de direcciones está abierto
 *        encima. Es límite del harness; queda documentado en el censo, con su camino de salida.
 */
const SURFACES: SurfaceDef[] = [
	{
		id: 'S1',
		label: 'Home · Origen',
		make: () => new HomeOriginSurface(),
		tripFlow: true,
		carriesSingleSurfaceRows: true
	},
	{
		id: 'S3',
		label: 'Home · Agregar otro destino',
		make: () => new HomeStopSurface(SEED_DESTINATION),
		tripFlow: true
	},
	{ id: 'S5', label: 'Home · Solo Ida', make: () => new TripTypeAddressSurface('S5', 'Solo Ida'), tripFlow: true },
	{ id: 'S6', label: 'Editar viaje programado', make: () => new ScheduledTripEditSurface(), tripFlow: true },
	{ id: 'S7', label: 'Perfil › Mis Direcciones', make: () => new ProfileAddressSurface(), tripFlow: false }
];

async function newSession(): Promise<{ driver: Driver; webview: string }> {
	const u = new URL(TARGET.appiumUrl);
	const driver = await remote({
		protocol: u.protocol.replace(':', '') as 'http' | 'https',
		hostname: u.hostname,
		port: Number(u.port) || 4723,
		path: '/',
		logLevel: 'error',
		connectionRetryTimeout: 60_000,
		capabilities: {
			platformName: 'Android',
			'appium:automationName': 'UiAutomator2',
			'appium:deviceName': process.env.ANDROID_DEVICE_NAME ?? 'SM-A055M',
			'appium:udid': TARGET.udid,
			'appium:appPackage': TARGET.appPackage,
			'appium:appActivity': '.MainActivity',
			'appium:noReset': true,
			'appium:forceAppLaunch': true,
			'appium:newCommandTimeout': 300
			// NO poner `appium:recreateChromeDriverSessions: true` — se probó y TUMBA EL SERVIDOR.
			//
			// El problema que parecía resolver es real: cada superficie relanza la app, eso destruye la
			// página de la WebView, y el chromedriver queda apuntando al target muerto respondiendo
			// `Can't restart when we're not online` a todo switch posterior — un estado del que no se
			// sale reintentando (medido: 45 s de reintentos, tres superficies, cero recuperaciones).
			//
			// Pero la cura resultó peor. Con la capability puesta, Appium mata y recrea el chromedriver
			// en CADA cambio de contexto, y matar el binario de Chrome 151 excede los 20 s que
			// `teen_process` tolera: el timeout sale como rechazo NO MANEJADO y el proceso de Appium
			// MUERE. Medido el 2026-08-23: el servidor se cayó a mitad de corrida y la suite siguió
			// golpeando un puerto muerto durante NUEVE HORAS, con cero mediciones.
			//   Error: Process didn't end after 20000ms (cmd: chromedriver-win64_v151.0.7922.138.exe)
			//
			// El fallo sin la capability es acotado (`attachToWebview` se rinde a los 45 s y la
			// superficie se reporta inalcanzable); con ella es ilimitado. Entre los dos, se elige el
			// acotado. La solución de fondo es no relanzar la app entre superficies — volver al home
			// navegando dentro del SPA, que no destruye la WebView — y está pendiente de validar.
		}
	});
	const contexts = (await driver.getContexts()) as unknown as string[];
	const webview = contexts.map(String).find(c => c.startsWith('WEBVIEW')) ?? '';
	if (webview) {
		await driver.switchContext(webview);
		await driver.pause(4500);
	}
	return { driver, webview };
}

/**
 * Relanza la APP dentro de la sesión Appium ya abierta y devuelve el contexto WEBVIEW nuevo.
 *
 * POR QUÉ EXISTE. `reach()` navega DESDE un punto de partida conocido (home / barra de tabs). Cuando
 * la superficie anterior dejó la app metida en otra pantalla — el caso típico es Perfil ›
 * Direcciones, que es una página propia sin tabs abajo —, la navegación de la superficie siguiente
 * no encuentra su punto de partida, `reach()` devuelve `false` y TODAS sus conductas se saltan con
 * motivo. Así se perdieron 28 de 33 mediciones.
 *
 * POR QUÉ RELANZAR LA APP Y NO ABRIR OTRA SESIÓN. Son dos cosas distintas que se habían confundido:
 * una sesión Appium nueva por superficie también daría un punto de partida limpio, pero nueve
 * sesiones tiraban abajo el servidor UiAutomator2 de este teléfono de 3,7 GB y se llevaban puestos
 * los tests restantes. Relanzar la app da el mismo punto de partida limpio y no rompe nada: son
 * `force-stop` + `am start` sobre el mismo paquete.
 *
 * NO BORRA LA SESIÓN DEL USUARIO. `terminateApp`/`activateApp` no tocan los datos de la app, así que
 * el login que la suite necesita (`noReset: true`) sobrevive. Lo que SÍ la borraría es limpiar datos
 * o reinstalar — por eso nada de eso pasa por acá.
 *
 * DEVUELVE EL HANDLE, no lo asume: al reiniciarse el proceso web, el contexto WEBVIEW capturado
 * antes queda MUERTO. Y por el mismo motivo se re-instala la captura de red: vive en el `window` de
 * la página, así que el relanzamiento se la lleva. Sin re-instalarla, toda conducta que se mide
 * leyendo requests saldría `SIN_DATOS` — se cambiaría un motivo de skip por otro.
 *
 * Cadena vacía = la app no volvió a montar su vista web. El llamador lo traduce a superficie
 * inalcanzable, nunca a un rojo.
 */
/**
 * Engancha la WebView recién montada, con reintento. Devuelve `false` si nunca queda utilizable.
 *
 * POR QUE NO ALCANZA UN `switchContext` SUELTO — medido el 2026-08-22, primera corrida que ejerció
 * `relaunchApp`. Que `getContexts()` devuelva el nombre del contexto NO significa que su página sea
 * navegable: tras `terminateApp`/`activateApp` chromedriver puede seguir enganchado al target
 * ANTERIOR, ya muerto, y responde `Can't restart when we're not online`. Ese error tumbó las cuatro
 * superficies de Home (S1, S3, S5, S6) en el hook, y con ellas 20 tests quedaron en "did not run" —
 * mientras S7, que corría más tarde, pasaba sin problema. Un fallo de re-attach se leía como
 * "el harness no llega a las pantallas".
 *
 * El reintento vuelve a NATIVE_APP entremedio para forzar el re-attach, y confirma con una lectura
 * barata (`getUrl`) que el contexto sirve de verdad: sin esa prueba de vida, un switch "exitoso"
 * contra una página muerta se descubre recién en la primera medición, ya como SIN_DATOS.
 */
async function attachToWebview(driver: Driver, webview: string): Promise<boolean> {
	const deadline = Date.now() + 45_000;
	let ultimoError = '';
	while (Date.now() < deadline) {
		try {
			await driver.switchContext(webview);
			// Prueba de vida: el nombre del contexto existe antes que la página sea navegable.
			await driver.getUrl();
			return true;
		} catch (e) {
			ultimoError = (e as Error).message ?? String(e);
			await driver.switchContext('NATIVE_APP').catch(() => undefined);
			await driver.pause(1500);
		}
	}
	console.log(`[mg116] la WebView no quedó utilizable tras el relanzamiento: ${ultimoError}`);
	return false;
}

async function relaunchApp(driver: Driver): Promise<string> {
	// Salir del WEBVIEW ANTES de matar la app: los comandos de app son nativos, y quedarse en un
	// contexto web que está por morir es la receta de un error de contexto inválido.
	await driver.switchContext('NATIVE_APP').catch(() => undefined);
	await driver.terminateApp(TARGET.appPackage).catch(() => undefined);
	await driver.pause(1500);
	await driver.activateApp(TARGET.appPackage).catch(() => undefined);
	// El arranque en frío de la app híbrida tarda: primero el proceso, después la WebView.
	await driver.pause(5000);

	// El contexto se busca con plazo, no con una sola lectura: en el arranque en frío la WebView
	// aparece unos segundos después del proceso, y una única consulta la pierde.
	const deadline = Date.now() + 45_000;
	let webview = '';
	while (Date.now() < deadline) {
		const contexts = (await driver.getContexts().catch(() => [])) as unknown as string[];
		webview = contexts.map(String).find(c => c.startsWith('WEBVIEW')) ?? '';
		if (webview) break;
		await driver.pause(750);
	}
	if (!webview) return '';

	if (!(await attachToWebview(driver, webview))) return '';

	// El arranque en frio vuelve a correr el bootstrap de autenticacion. Con la sesion compartida eso
	// pasaba CERO veces; ahora pasa una por superficie, asi que un token vencido dejaria las CINCO
	// superficies inalcanzables de golpe — y se leeria como "el harness no llega a las pantallas".
	// Recuperarlo aca cuesta segundos; descubrirlo al final cuesta la corrida entera.
	const sesion = await ensurePassengerSession(driver);
	if (sesion.status === 'recuperada') {
		console.log(`[mg116] sesion recuperada tras el relanzamiento: ${sesion.detalle}`);
	} else if (sesion.status !== 'con-sesion') {
		// No se lanza: el llamador convierte la cadena vacia en superficie inalcanzable con motivo.
		// Un problema de sesion no es un defecto del producto y no debe pintar un test de rojo.
		console.log(`[mg116] SIN SESION (${sesion.status}): ${sesion.detalle}`);
		return '';
	}
	// Mismo settle que usa `newSession()`: el DOM de Ionic todavía se está hidratando.
	await driver.pause(4500);
	await installWebViewNetworkCapture(driver).catch(() => undefined);
	return webview;
}

test.describe(`[MG-116] Consistencia de los campos de dirección — App PAX (${TARGET.env})`, () => {
	test.skip(
		!process.env.APPIUM_SERVER_URL,
		'Sin APPIUM_SERVER_URL: la suite necesita un dispositivo físico con Appium.'
	);

	// El timeout global del proyecto es de 60 s, pensado para tests de navegador. Acá cada test
	// arranca una sesión Appium (~15-40 s con relanzamiento de la app) y además re-establece la
	// superficie, que puede navegar tres pantallas. Con 60 s el `beforeAll` se aborta ANTES de crear
	// la sesión y los 29 tests quedan en "did not run" — pasó en la primera corrida. Mismo valor que
	// usa el spec de guards, que ya estaba calibrado contra este dispositivo.
	test.describe.configure({ timeout: 240_000 });

	// UNA sola sesion Appium para toda la suite, no una por superficie.
	//
	// Con una sesion por superficie mas las de los guards, una corrida abria nueve sesiones y el
	// servidor UiAutomator2 del dispositivo terminaba cayendose a mitad de camino
	// ("instrumentation process is not running (probably crashed)"), llevandose puestos los tests que
	// faltaban. Es un telefono de 3,7 GB: la presion la genera la corrida, no el producto.
	//
	// Compartir la sesion es seguro porque cada conducta ya re-establece su superficie antes de medir,
	// que es lo que evita la contaminacion entre chequeos.
	//
	// El handle del WEBVIEW NO se guarda a nivel de suite: cada superficie relanza la app y se queda
	// con el handle que ese relanzamiento devuelve. Un handle capturado una sola vez acá quedaria
	// muerto en el primer relanzamiento, y usarlo despues es indistinguible de "la app no monto su
	// vista web" — el falso inalcanzable que este spec justamente tiene que evitar.
	let shared: Driver | null = null;

	test.beforeAll(async () => {
		shared = (await newSession()).driver;
	});

	test.afterAll(async () => {
		await shared?.deleteSession().catch(() => undefined);
		shared = null;
	});

	for (const def of SURFACES) {
		const rows = [...commonRows(def.tripFlow), ...(def.carriesSingleSurfaceRows ? SINGLE_SURFACE_ROWS : [])];

		// NO es `describe.serial`, y la diferencia es de MEDICIÓN, no de estilo.
		//
		// En modo serial Playwright saltea todos los tests siguientes en cuanto uno falla. Acá eso
		// convertía un defecto REAL del producto en pérdida de cobertura: medido el 2026-08-22, el
		// debounce falla de verdad en S1/S5/S7 (10 pulsaciones a 80 ms → 2, 5 y 2 requests), y ese
		// rojo legítimo se llevaba puestas las 4-5 conductas siguientes de cada superficie — piso de
		// caracteres, distinctUntilChanged, sessionToken y su rotación quedaban sin medir. Corrieron
		// 8 de 33 tests. El estado no justifica el modo serial: cada conducta re-establece su
		// superficie antes de medir (ver el `reach()` de más abajo), así que son independientes.
		//
		// El orden se conserva igual porque la suite corre con `--workers=1`: un dispositivo físico
		// no se paraleliza.
		test.describe(`${def.id} — ${def.label}`, () => {
			// El timeout tambien se declara ACA, no solo en el describe externo: el `beforeAll` que crea
			// la sesion vive en este describe, y con el valor global de 60 s se aborta antes de conectar.
			test.describe.configure({ timeout: 240_000 });

			let driver: Driver | null = null;
			let probe: AddressFieldProbe | null = null;
			let surface: AddressSurface | null = null;
			let selector = '';
			let unreachableReason = '';

			test.beforeAll(async () => {
				driver = shared;
				if (!driver) {
					unreachableReason = 'La app no montó su vista web (sin contexto WEBVIEW).';
					return;
				}

				// Relanzar la app ANTES de navegar: `reach()` parte del home, y la superficie anterior
				// pudo dejar la app tres pantallas adentro. Sin esto la navegacion no encuentra su punto
				// de partida y la superficie se reporta inalcanzable con el producto sano.
				const webview = await relaunchApp(driver);
				if (!webview) {
					unreachableReason = 'La app no montó su vista web (sin contexto WEBVIEW).';
					return;
				}

				probe = new AddressFieldProbe(driver);
				surface = def.make();
				const reached = await surface.reach(driver);
				selector = surface.fieldSelector();
				if (!reached || !selector.trim()) {
					unreachableReason = `Superficie ${def.id} no alcanzable en este entorno (alcanzada=${reached}, selector="${selector}"). NO es un defecto del producto: es límite del harness o superficie inexistente en esta versión.`;
				}
			});

			// La sesion NO se cierra acá: es compartida y la cierra el describe externo. Solo se deja la
			// superficie limpia para que la siguiente pueda arrancar.
			test.afterAll(async () => {
				await surface?.cleanup(driver as Driver).catch(() => undefined);
			});

			for (const row of rows) {
				test(
					`${def.id}: ${row.title}`,
					{
						annotation: [
							...row.tms.map(key => ({ type: 'tms', description: key })),
							{ type: 'surface', description: `${def.id} — ${def.label}` }
						],
						tag: ['@regression', '@mg116']
					},
					async () => {
						test.skip(!!unreachableReason, unreachableReason);

						// Re-establecer la superficie antes de cada conducta: sin esto, el campo de Perfil ›
						// Mis Direcciones deja de aceptar texto tras el primer chequeo y las conductas
						// siguientes salen SIN_DATOS con el producto sano (medido el 2026-08-19).
						await surface!.reach(driver as Driver);
						const current = surface!.fieldSelector();
						expect(current.trim(), `${def.id} perdió su selector al re-establecer la superficie`).not.toBe(
							''
						);

						const verdict = await row.run(probe as AddressFieldProbe, current);

						test.info().annotations.push({
							type: 'medición',
							description: `${verdict.status} — ${verdict.verdict}`
						});
						await test.info().attach(`${def.id}-${verdict.behavior}-medicion.json`, {
							body: JSON.stringify({ surface: def.id, selector: current, ...verdict }, null, 2),
							contentType: 'application/json'
						});

						// Cero datos NO es una falla del producto: es una conducta que no se ejerció.
						test.skip(
							verdict.status === 'SIN_DATOS' || verdict.status === 'NO_EJERCIDO',
							`${verdict.status}: ${verdict.verdict}`
						);

						if (row.assertMeasured && verdict.measured) {
							row.assertMeasured(verdict.measured);
						}
						expect(verdict.status, verdict.verdict).toBe('PASS');
					}
				);
			}
		});
	}
});
