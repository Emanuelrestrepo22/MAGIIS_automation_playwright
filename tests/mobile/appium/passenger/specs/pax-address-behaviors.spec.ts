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
 * cubre, y por eso los dos defectos de Mis Direcciones necesitaron ID propio (TM-733, TM-734).
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
import { HomeOriginSurface, HomeStopSurface, ProfileAddressSurface, ScheduledTripEditSurface, TripTypeAddressSurface } from '../surfaces/homeSurfaces';

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
			title: tripFlow ? 'respeta el piso de 3 caracteres' : 'permite buscar por código IATA de 3 letras',
			tms: tripFlow ? ['TM-680', 'TM-681'] : ['TM-734'],
			run: (probe, sel) => probe.checkMinLength(sel)
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
	{ id: 'S1', label: 'Home · Origen', make: () => new HomeOriginSurface(), tripFlow: true, carriesSingleSurfaceRows: true },
	{ id: 'S3', label: 'Home · Agregar otro destino', make: () => new HomeStopSurface(SEED_DESTINATION), tripFlow: true },
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

test.describe(`[MG-116] Consistencia de los campos de dirección — App PAX (${TARGET.env})`, () => {
	test.skip(!process.env.APPIUM_SERVER_URL, 'Sin APPIUM_SERVER_URL: la suite necesita un dispositivo físico con Appium.');

	// El timeout global del proyecto es de 60 s, pensado para tests de navegador. Acá cada test
	// arranca una sesión Appium (~15-40 s con relanzamiento de la app) y además re-establece la
	// superficie, que puede navegar tres pantallas. Con 60 s el `beforeAll` se aborta ANTES de crear
	// la sesión y los 29 tests quedan en "did not run" — pasó en la primera corrida. Mismo valor que
	// usa el spec de guards, que ya estaba calibrado contra este dispositivo.
	test.describe.configure({ timeout: 240_000 });

	for (const def of SURFACES) {
		const rows = [...commonRows(def.tripFlow), ...(def.carriesSingleSurfaceRows ? SINGLE_SURFACE_ROWS : [])];

		test.describe.serial(`${def.id} — ${def.label}`, () => {
			// El timeout tambien se declara ACA, no solo en el describe externo: el `beforeAll` que crea
			// la sesion vive en este describe, y con el valor global de 60 s se aborta antes de conectar.
			test.describe.configure({ timeout: 240_000 });

			let driver: Driver | null = null;
			let probe: AddressFieldProbe | null = null;
			let surface: AddressSurface | null = null;
			let selector = '';
			let unreachableReason = '';

			test.beforeAll(async () => {
				const session = await newSession();
				driver = session.driver;
				if (!session.webview) {
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

			test.afterAll(async () => {
				await surface?.cleanup(driver as Driver).catch(() => undefined);
				await driver?.deleteSession().catch(() => undefined);
			});

			for (const row of rows) {
				test(
					`${def.id}: ${row.title}`,
					{
						annotation: [...row.tms.map(key => ({ type: 'tms', description: key })), { type: 'surface', description: `${def.id} — ${def.label}` }],
						tag: ['@regression', '@mg116']
					},
					async () => {
						test.skip(!!unreachableReason, unreachableReason);

						// Re-establecer la superficie antes de cada conducta: sin esto, el campo de Perfil ›
						// Mis Direcciones deja de aceptar texto tras el primer chequeo y las conductas
						// siguientes salen SIN_DATOS con el producto sano (medido el 2026-08-19).
						await surface!.reach(driver as Driver);
						const current = surface!.fieldSelector();
						expect(current.trim(), `${def.id} perdió su selector al re-establecer la superficie`).not.toBe('');

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
						test.skip(verdict.status === 'SIN_DATOS' || verdict.status === 'NO_EJERCIDO', `${verdict.status}: ${verdict.verdict}`);

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
