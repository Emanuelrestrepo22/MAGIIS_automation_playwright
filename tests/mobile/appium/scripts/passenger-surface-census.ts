/**
 * MG-116 / Fase 0 — CENSO de las superficies de App PAX que tienen campo de direccion.
 *
 * POR QUE EXISTE
 * El alcance declarado de MG-116 nombra UN archivo: la directiva `search-places`. Pero App PAX no
 * tiene un campo de direccion: tiene varios, y en el repo de la app aparecen TRES implementaciones
 * paralelas de la misma conducta, cada una con su propio `debounceTime` y su propia lista de
 * predicciones — incluida la de Perfil > Direcciones, que llama a Google directo.
 *
 * Ese checkout esta DESACTUALIZADO (su directiva es anterior a MG-116), asi que no sirve para
 * concluir que hace v2.5.19. Lo que si establece es el hecho que ordena todo el plan: una migracion
 * puede haber alcanzado a unas implementaciones y no a otras.
 *
 * Este script NO mide conducta. Solo responde QUE superficies existen realmente en el build de UAT,
 * para no disenar una matriz sobre pantallas supuestas. Es deliberadamente de solo lectura:
 * navega, enumera y vuelca. No escribe direcciones, no crea viajes, no toca la wallet.
 *
 * SUPERFICIES QUE BUSCA
 *   S1/S2/S3  Home: Origen, Destino, Agregar otro destino (paradas)
 *   S4/S5     Tabs de tipo de viaje (Solo Ida / Ida y Vuelta / A Disposicion)
 *   S6        Edicion de viaje programado   <- puede NO existir en esta version
 *   S7        Perfil > Direcciones          <- la de mayor valor esperado
 *
 * Una superficie que no aparece se reporta como INEXISTENTE en esta version, que es un resultado
 * legitimo — no un pendiente ni un fallo del script.
 *
 * PRECONDICION: App PAX de UAT abierta y con sesion iniciada en el dispositivo. Se corre con
 * `noReset: true` y `forceAppLaunch: false` a proposito: `.env.uat` no trae credenciales de
 * pasajero (el usuario de `.env.test` es de otra base y no se asume valido en UAT).
 */

import { remote } from 'webdriverio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveDriverTarget, describe as describeTarget } from './_shared/resolveDriverTarget';

const TARGET = resolveDriverTarget('passenger');
const log = (m: string): void => console.log(`[census] ${m}`);
const line = (): void => log('='.repeat(72));

type InputRow = { index: number; placeholder: string; value: string; readOnly: boolean; type: string };
type SegmentRow = { tag: string; text: string; value: string; selected: boolean; classes: string };
type Snapshot = {
	label: string;
	reached: boolean;
	url: string;
	inputs: InputRow[];
	segments: SegmentRow[];
	predictionListPresent: boolean;
	note?: string;
};

/**
 * Enumera TODOS los inputs visibles con su indice. Portado de `driver-mg117-waypoints.ts:62`.
 * El indice es lo que hoy falta en la capa PAX: `findVisibleInput` siempre devuelve el PRIMER
 * visible, asi que sin esto no se puede direccionar la parada n.
 */
async function listInputs(driver: WebdriverIO.Browser): Promise<InputRow[]> {
	return (await driver.execute(() => {
		const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		return Array.from(document.querySelectorAll('input'))
			.filter(vis)
			.map((el, index) => {
				const i = el as HTMLInputElement;
				return {
					index,
					placeholder: (i.placeholder ?? '').trim(),
					value: i.value,
					readOnly: i.readOnly,
					type: i.type
				};
			});
	})) as InputRow[];
}

/** Los tabs de tipo de viaje. `passenger-newtrip-dump.ts:44` los volcaba pero nunca se persistieron. */
async function listSegments(driver: WebdriverIO.Browser): Promise<SegmentRow[]> {
	return (await driver.execute(() => {
		const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		return Array.from(document.querySelectorAll('ion-segment-button, ion-segment, .segment-button'))
			.filter(vis)
			.map(el => {
				const e = el as HTMLElement & { value?: string };
				return {
					tag: e.tagName.toLowerCase(),
					text: (e.textContent ?? '').trim().slice(0, 40),
					value: String(e.value ?? e.getAttribute('value') ?? ''),
					selected:
						e.getAttribute('aria-selected') === 'true' ||
						e.className.includes('segment-button-checked') ||
						e.className.includes('active'),
					classes: e.className.slice(0, 120)
				};
			});
	})) as SegmentRow[];
}

async function currentUrl(driver: WebdriverIO.Browser): Promise<string> {
	return (await driver.execute(() => window.location.href).catch(() => '')) as string;
}

type NavEl = { tag: string; text: string; classes: string; id: string; name: string; ariaLabel: string };

/**
 * Mapa de navegacion: cada elemento visible con el que se puede interactuar.
 *
 * La primera corrida del censo intento navegar adivinando selectores (`/menu/i` sobre la clase, el
 * texto "direccion") y no se movio de la home: el tap cayo en un elemento equivocado y encima limpio
 * el campo Origen. Adivinar el DOM de una app hibrida sale caro. Esto lo vuelca una vez y despues se
 * navega por lo que realmente existe.
 */
async function navMap(driver: WebdriverIO.Browser): Promise<NavEl[]> {
	return (await driver.execute(() => {
		const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const sel =
			'ion-item, ion-button, ion-tab-button, ion-menu-button, ion-back-button, ion-segment-button, ' +
			'ion-fab-button, ion-icon, button, a, [role="button"], ion-card, ion-label, ion-col';
		return Array.from(document.querySelectorAll(sel))
			.filter(vis)
			.map(el => {
				const e = el as HTMLElement;
				return {
					tag: e.tagName.toLowerCase(),
					text: (e.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 48),
					classes: (e.className ?? '').toString().slice(0, 90),
					id: e.id ?? '',
					name: e.getAttribute('name') ?? e.getAttribute('ng-reflect-name') ?? '',
					ariaLabel: e.getAttribute('aria-label') ?? ''
				};
			})
			.filter(e => e.text.length > 0 || e.name.length > 0 || e.ariaLabel.length > 0);
	})) as NavEl[];
}

/** La lista de predicciones: su presencia indica que la superficie monta un autocompletado. */
async function hasPredictionList(driver: WebdriverIO.Browser): Promise<boolean> {
	return (await driver.execute(() => {
		return (
			document.querySelectorAll('ion-list.prediction-list, .prediction-list, ion-item.prediction-item').length > 0
		);
	})) as boolean;
}

/** Texto visible, para decidir si una navegacion llego a donde se esperaba. */
async function visibleText(driver: WebdriverIO.Browser, max = 4000): Promise<string> {
	return (await driver.execute((m: number) => {
		return (document.body.innerText ?? '').slice(0, m);
	}, max)) as string;
}

/**
 * Tap nativo por texto. El `.click()` del DOM no dispara los handlers de Ionic en esta app
 * (comprobado en TM-684/TM-687, donde un click programatico simulo dos defectos inexistentes).
 */
async function tapNativeByText(
	driver: WebdriverIO.Browser,
	selector: string,
	needle: string,
	timeout = 8000
): Promise<boolean> {
	const target = needle.toLowerCase();
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		// `$$` devuelve un ChainablePromiseArray, que NO tiene `.catch`: hay que envolverlo.
		let els: unknown[] = [];
		try {
			els = (await driver.$$(selector)) as unknown as unknown[];
		} catch {
			els = [];
		}
		for (const el of els as {
			isDisplayed: () => Promise<boolean>;
			getText: () => Promise<string>;
			click: () => Promise<void>;
		}[]) {
			try {
				if (!(await el.isDisplayed())) continue;
				const txt = (await el.getText()).toLowerCase();
				if (!txt.includes(target)) continue;
				await el.click();
				await driver.pause(1800);
				return true;
			} catch {
				// elemento re-renderizado entre la lectura y el tap: se sigue con el siguiente
			}
		}
		await driver.pause(300);
	}
	return false;
}

async function snapshot(
	driver: WebdriverIO.Browser,
	label: string,
	reached: boolean,
	note?: string
): Promise<Snapshot> {
	const snap: Snapshot = {
		label,
		reached,
		url: await currentUrl(driver),
		inputs: reached ? await listInputs(driver) : [],
		segments: reached ? await listSegments(driver) : [],
		predictionListPresent: reached ? await hasPredictionList(driver) : false,
		note
	};
	log(`\n-- ${label} --`);
	log(`   alcanzada: ${reached ? 'SI' : 'NO'}${note ? `  (${note})` : ''}`);
	log(`   url: ${snap.url}`);
	if (snap.segments.length) {
		log(`   tabs (${snap.segments.length}):`);
		for (const s of snap.segments) {
			log(`     <${s.tag}> "${s.text}" value="${s.value}"${s.selected ? '  [SELECCIONADO]' : ''}`);
		}
	}
	log(`   inputs visibles (${snap.inputs.length}):`);
	for (const i of snap.inputs) {
		log(
			`     [${i.index}] type=${i.type} placeholder="${i.placeholder}" value="${i.value}"${i.readOnly ? ' [readonly]' : ''}`
		);
	}
	log(`   lista de predicciones montada: ${snap.predictionListPresent ? 'SI' : 'no'}`);
	return snap;
}

/** Vuelve al home. Sin `driver.back()` en bucle: eso deslogueo la app en una corrida anterior. */
async function backToHome(driver: WebdriverIO.Browser): Promise<boolean> {
	for (let i = 0; i < 4; i++) {
		const url = await currentUrl(driver);
		if (/HomePage/i.test(url)) return true;
		const backed = await tapNativeByText(
			driver,
			'ion-icon, ion-button, ion-back-button, button, ion-tab-button, ion-item',
			'inicio',
			2500
		);
		if (!backed) {
			// Flecha de retroceso por atributo, que es como cierra el buscador de direcciones
			// (portado de driver-mg117-waypoints.ts:121).
			await driver
				.execute(() => {
					const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
					const el = Array.from(document.querySelectorAll('ion-icon, ion-back-button, .arrow-back'))
						.filter(vis)
						.find(e => {
							const n = `${e.getAttribute('name') ?? ''}${e.getAttribute('ng-reflect-name') ?? ''}${e.className}`;
							return /arrow-back|arrow_back/i.test(n);
						}) as HTMLElement | undefined;
					el?.click();
				})
				.catch(() => undefined);
			await driver.pause(1500);
		}
	}
	return /HomePage/i.test(await currentUrl(driver));
}

/** Abre el menu lateral. Es la puerta a Perfil > Direcciones (S7). */
async function openMenu(driver: WebdriverIO.Browser): Promise<boolean> {
	const opened = (await driver
		.execute(() => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const el = Array.from(document.querySelectorAll('ion-menu-button, ion-buttons ion-button, ion-icon'))
				.filter(vis)
				.find(e => {
					const n = `${e.getAttribute('name') ?? ''}${e.getAttribute('ng-reflect-name') ?? ''}${e.className}${e.getAttribute('aria-label') ?? ''}`;
					return /menu/i.test(n);
				}) as HTMLElement | undefined;
			if (!el) return false;
			el.click();
			return true;
		})
		.catch(() => false)) as boolean;
	await driver.pause(2000);
	return opened;
}

async function run(): Promise<void> {
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
			'appium:forceAppLaunch': false,
			'appium:newCommandTimeout': 300
		} as Record<string, unknown>
	});

	const out: Record<string, unknown> = {
		ticket: 'MG-116',
		phase: 'Fase 0 - censo de superficies',
		target: TARGET,
		targetLine: describeTarget(TARGET),
		capturedAt: new Date().toISOString()
	};
	const surfaces: Snapshot[] = [];

	try {
		const ctx = (await driver.getContexts()) as string[];
		const webview = ctx.find(c => String(c).startsWith('WEBVIEW'));
		if (!webview) {
			log('ABORTA: sin contexto WEBVIEW.');
			out.aborted = 'sin contexto WEBVIEW';
			return;
		}
		await driver.switchContext(webview);

		const startUrl = await currentUrl(driver);
		log(`URL inicial: ${startUrl}`);
		out.startUrl = startUrl;
		if (/\/login/i.test(startUrl)) {
			log('ABORTA: la app esta en el login. `.env.uat` no trae credenciales de pasajero:');
			log('        iniciar sesion a mano en el dispositivo y reintentar.');
			out.aborted = 'app en login y sin credenciales de UAT';
			return;
		}

		// ---------------------------------------------------------------- HOME (S1/S2/S3 + tabs)
		line();
		log('HOME — S1 Origen · S2 Destino · S3 Agregar otro destino · tabs de tipo de viaje');
		line();
		const atHome = await backToHome(driver);
		surfaces.push(
			await snapshot(
				driver,
				'HOME (S1/S2/S3 + tabs S4/S5)',
				atHome,
				atHome ? undefined : 'no se pudo volver al home'
			)
		);

		const homeText = await visibleText(driver);
		out.homeTextSample = homeText.slice(0, 1200);

		const homeNavMap = await navMap(driver);
		out.homeNavMap = homeNavMap;
		log(`\n   mapa de navegacion del home (${homeNavMap.length} elementos interactivos):`);
		for (const e of homeNavMap) {
			log(
				`     <${e.tag}>${e.id ? `#${e.id}` : ''} "${e.text}"${e.name ? ` name=${e.name}` : ''}${e.classes ? `  .${e.classes}` : ''}`
			);
		}

		// Que tipos de viaje ofrece este carrier. "A Disposicion" es configurable por carrier
		// (existe el rechazo SERVICE_TYPE_NO_ADMIT_STOPS), asi que su ausencia es dato, no fallo.
		const tripTypeLabels = ['Solo Ida', 'Ida y Vuelta', 'Disposici', 'Programar viaje'];
		const offered = tripTypeLabels.filter(t => new RegExp(t, 'i').test(homeText));
		log(`\n   tipos de viaje visibles en el home: ${offered.join(' · ') || '(ninguno detectado)'}`);
		out.tripTypesOffered = offered;

		// ---------------------------------------------------------------- S7 Perfil > Direcciones
		line();
		log('S6 y S7 — reachability, SIN navegar a ciegas');
		line();
		// La iteracion anterior intento llegar a Direcciones y a Programados adivinando selectores.
		// No solo no se movio de la home: el tap cayo en un elemento equivocado y LIMPIO el campo
		// Origen. Con la app de UAT en un estado que despues hay que reponer a mano, navegar a ciegas
		// cuesta mas de lo que averigua. Esta iteracion solo REPORTA que puertas existen, tomadas del
		// mapa de navegacion real, y la navegacion se implementa contra esos selectores.
		const entryFor = (re: RegExp): NavEl[] => homeNavMap.filter(e => re.test(`${e.text} ${e.name} ${e.ariaLabel}`));

		const doors = {
			S7_direcciones: entryFor(/direccion/i),
			S6_actividad: entryFor(/actividad|viaje|programad/i),
			cuenta: entryFor(/mi cuenta|perfil/i),
			tabsTipoViaje: entryFor(/solo ida|ida y vuelta|disposici/i)
		};
		out.doors = doors;

		for (const [name, els] of Object.entries(doors)) {
			log(`
   ${name}: ${els.length} candidato(s)`);
			for (const e of els) {
				log(`     <${e.tag}>${e.id ? `#${e.id}` : ''} "${e.text}"${e.classes ? `  .${e.classes}` : ''}`);
			}
		}

		// ---------------------------------------------------------------- Cierre
		await backToHome(driver);
		out.surfaces = surfaces;

		line();
		log('RESUMEN DEL CENSO');
		line();
		for (const s of surfaces) {
			const addressInputs = s.inputs.filter(i => /origen|destino|direcci|lugar|domicilio/i.test(i.placeholder));
			log(
				`  ${s.reached ? 'OK ' : '-- '} ${s.label.padEnd(46)} inputs=${String(s.inputs.length).padStart(2)}  de-direccion=${addressInputs.length}  predicciones=${s.predictionListPresent ? 'si' : 'no'}`
			);
		}
		line();
		log('Las superficies marcadas con -- quedan declaradas INEXISTENTES o INALCANZABLES en esta');
		log('version. Es un resultado del censo, no un pendiente: la matriz no las incluye.');
		line();
	} finally {
		const dir = path.resolve('evidence', 'network-capture');
		await mkdir(dir, { recursive: true });
		const f = path.join(dir, `mg116-surface-census-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
		await writeFile(f, JSON.stringify(out, null, 2), 'utf8');
		log(`Evidencia -> ${f}`);
		await driver.deleteSession().catch(() => undefined);
	}
}

/** El formulario de direccion se reconoce por su input de lugar o por su lista de predicciones. */
async function hasPredictionListOrAddressInput(driver: WebdriverIO.Browser): Promise<boolean> {
	const inputs = await listInputs(driver);
	if (inputs.some(i => /direcci|lugar|domicilio|address/i.test(i.placeholder))) return true;
	return hasPredictionList(driver);
}

run().catch((e: Error) => {
	console.error('[census] Error:', e.message ?? e);
	process.exit(1);
});
