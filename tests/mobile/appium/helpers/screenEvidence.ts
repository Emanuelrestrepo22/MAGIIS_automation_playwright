/**
 * Evidencia visual y desbloqueo de pantalla para las corridas moviles.
 *
 * POR QUE EXISTE
 * Dos problemas distintos que aparecen juntos en cada corrida contra un dispositivo real:
 *
 * 1. UNA CAPTURA DE RED NO ALCANZA COMO EVIDENCIA. Que el request salga no prueba que el usuario
 *    haya visto algo: la lista de predicciones puede no renderizar, el campo puede no poblarse, el
 *    modal puede tapar la pantalla. La captura de pantalla es lo que hace auditable el veredicto
 *    para alguien que no corrio la prueba.
 *
 * 2. LA APP SE QUEDA TRABADA Y LA CORRIDA SIGUIENTE HEREDA EL ESTADO. Un dialogo abierto, un viaje
 *    activo o un buscador de direcciones que no cerro dejan la app en un punto del que los scripts
 *    no salen — y el sintoma es un timeout sin causa aparente, no un mensaje util.
 *
 * POLITICA DE DESBLOQUEO — deliberadamente conservadora
 * Este helper NO cierra cualquier dialogo que encuentre. Un "Aceptar" puede estar confirmando algo
 * (cancelar un viaje, borrar una tarjeta) y cerrarlo a ciegas es tomar una decision de negocio en
 * nombre del usuario. Lo que hace es: describir el bloqueo con su texto y sus botones, sacar una
 * captura, y cerrar UNICAMENTE los que matchean una lista blanca de dialogos informativos. Todo lo
 * demas se reporta con el camino de salida sugerido, para que lo resuelva una persona.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Todo lo visual de una corrida cae acá, agrupado por etiqueta de corrida. */
const SCREENSHOT_ROOT = path.resolve('evidence', 'screenshots');

export type Blocker = {
	kind: string;
	text: string;
	buttons: string[];
	/** Sugerencia de salida en lenguaje humano, para pegar en un reporte. */
	suggestedExit: string;
	/** true si este helper se considera autorizado a cerrarlo solo. */
	safeToAutoDismiss: boolean;
};

export type ScreenshotRef = {
	label: string;
	/** Ruta relativa al repo: es la que se pega en un ticket, no la absoluta. */
	relPath: string;
	takenAt: string;
};

/**
 * Dialogos informativos que se pueden cerrar solos sin decidir nada por el usuario.
 * Todo lo que NO este acá se reporta y se deja como esta.
 */
const SAFE_DISMISS_PATTERNS: { re: RegExp; why: string }[] = [
	{ re: /ya tiene un viaje creado/i, why: 'aviso de viaje activo: informativo, el viaje no se toca al aceptar' },
	{ re: /su sesi[oó]n ha expirado/i, why: 'aviso de sesion expirada: aceptar solo lleva al login' },
	{ re: /versi[oó]n desactualizada|actualiza(r|cion)/i, why: 'aviso de version: informativo' },
	{ re: /no hay (autos|servicios) disponibles/i, why: 'aviso de disponibilidad: informativo' }
];

/** Botones que NUNCA se tocan automaticamente, aunque el dialogo parezca inofensivo. */
const NEVER_AUTOTAP = /elimina|borrar|cancelar viaje|confirmar|pagar|aceptar t[eé]rminos/i;

export class ScreenEvidence {
	private readonly shots: ScreenshotRef[] = [];
	private counter = 0;

	constructor(
		private readonly driver: WebdriverIO.Browser,
		/** Etiqueta de la corrida: agrupa las capturas en su propia carpeta. */
		private readonly runLabel: string
	) {}

	/**
	 * Captura la pantalla y devuelve la ruta RELATIVA al repo.
	 *
	 * Se numera con un contador propio y no con la hora: al leer el reporte importa el ORDEN de los
	 * pasos, y un nombre ordenable alfabeticamente evita tener que cruzar timestamps a mano.
	 */
	async capture(label: string): Promise<ScreenshotRef> {
		const dir = path.join(SCREENSHOT_ROOT, this.runLabel);
		await mkdir(dir, { recursive: true });
		const safe = label.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 70);
		const name = `${String(++this.counter).padStart(2, '0')}-${safe}.png`;
		const abs = path.join(dir, name);
		await this.driver.saveScreenshot(abs);
		const ref: ScreenshotRef = {
			label,
			relPath: path.relative(process.cwd(), abs).replace(/\\/g, '/'),
			takenAt: new Date().toISOString()
		};
		this.shots.push(ref);
		console.log(`[shot] ${ref.relPath}`);
		return ref;
	}

	all(): ScreenshotRef[] {
		return this.shots;
	}

	/** Bloque listo para pegar en un ticket: las rutas relativas, en orden. */
	manifest(): string[] {
		return this.shots.map(s => `${s.relPath}  — ${s.label}`);
	}

	// ------------------------------------------------------------------ bloqueos

	/**
	 * Describe lo que esta tapando la pantalla, sin tocarlo.
	 *
	 * Busca los contenedores modales que esta app usa realmente (`app-confirm-modal` aparecio en
	 * `PassengerNewTripScreen.detectTripAlreadyCreatedModal:289`; `ion-alert`/`ion-toast` son los de
	 * Ionic) y ademas la pareja de botones sueltos `.btn.primary` / `.btn-outlined-red`, que es como
	 * se vio el dialogo del home de UAT en el censo del 2026-08-18.
	 */
	async describeBlockers(): Promise<Blocker[]> {
		const raw = (await this.driver.execute(() => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const containers = Array.from(
				document.querySelectorAll('app-confirm-modal, ion-alert, ion-modal, ion-toast, .alert-wrapper, .toast-wrapper')
			).filter(vis);

			const out = containers.map(c => ({
				kind: c.tagName.toLowerCase(),
				text: (c.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 300),
				buttons: Array.from(c.querySelectorAll('button, ion-button, [role="button"]'))
					.filter(vis)
					.map(b => (b.textContent ?? '').trim())
					.filter(Boolean)
					.slice(0, 6)
			}));

			// Dialogo sin contenedor reconocible.
			//
			// Ojo con el falso positivo: `button.btn.primary` NO es exclusivo de los dialogos — el
			// "Guardar" del formulario de Mis Direcciones usa la misma clase, y tomarlo por un dialogo
			// hizo abortar una corrida entera contra una pantalla que estaba perfectamente usable.
			// Para contar como bloqueo hace falta una senal de MODALIDAD: un backdrop, o la pareja
			// confirmar/cancelar junta, que es la forma que tienen los dialogos de esta app.
			if (out.length === 0) {
				const backdrop = Array.from(document.querySelectorAll('ion-backdrop, .modal-wrapper, .backdrop')).filter(vis);
				const confirm = Array.from(document.querySelectorAll('button.btn.primary')).filter(vis);
				const cancel = Array.from(document.querySelectorAll('button.btn-outlined-red')).filter(vis);
				const isModal = backdrop.length > 0 || (confirm.length > 0 && cancel.length > 0);
				if (isModal) {
					out.push({
						kind: 'dialogo-sin-contenedor',
						text: (document.body.innerText ?? '').trim().replace(/\s+/g, ' ').slice(-300),
						buttons: [...confirm, ...cancel].map(b => (b.textContent ?? '').trim()).filter(Boolean)
					});
				}
			}
			return out;
		})) as { kind: string; text: string; buttons: string[] }[];

		return raw.map(b => {
			const safe = SAFE_DISMISS_PATTERNS.find(p => p.re.test(b.text));
			const risky = b.buttons.some(x => NEVER_AUTOTAP.test(x));
			return {
				kind: b.kind,
				text: b.text,
				buttons: b.buttons,
				safeToAutoDismiss: Boolean(safe) && !risky,
				suggestedExit: safe
					? `Cerrable automaticamente (${safe.why}). Boton: ${b.buttons[0] ?? 'el de confirmacion'}.`
					: risky
						? `NO se cierra solo: alguno de sus botones (${b.buttons.join(' / ')}) toma una decision de negocio. Resolver a mano y volver a correr.`
						: `Dialogo no reconocido. Botones: ${b.buttons.join(' / ') || '(ninguno visible)'}. Revisar la captura y decidir a mano antes de reintentar.`
			};
		});
	}

	/**
	 * Cierra solo los bloqueos de la lista blanca. Devuelve que cerro y que dejo intacto.
	 * Saca captura ANTES de tocar nada: si algo sale mal, la evidencia del estado previo existe.
	 */
	async clearSafeBlockers(): Promise<{ dismissed: Blocker[]; left: Blocker[]; shot?: ScreenshotRef }> {
		const blockers = await this.describeBlockers();
		if (blockers.length === 0) return { dismissed: [], left: [] };

		const shot = await this.capture('bloqueo-detectado');
		const dismissed: Blocker[] = [];
		const left: Blocker[] = [];

		for (const b of blockers) {
			if (!b.safeToAutoDismiss) {
				left.push(b);
				continue;
			}
			const target = b.buttons.find(x => /aceptar|ok|entendido|continuar/i.test(x)) ?? b.buttons[0];
			if (!target) {
				left.push(b);
				continue;
			}
			const tapped = (await this.driver.execute((label: string) => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const el = Array.from(document.querySelectorAll('button, ion-button, [role="button"]'))
					.filter(vis)
					.find(e => (e.textContent ?? '').trim().toLowerCase() === label.toLowerCase()) as HTMLElement | undefined;
				if (!el) return false;
				el.click();
				return true;
			}, target)) as boolean;
			await this.driver.pause(1500);
			(tapped ? dismissed : left).push(b);
		}

		if (dismissed.length) await this.capture('bloqueo-cerrado');
		return { dismissed, left, shot };
	}

	/**
	 * Cuando una superficie no se pudo alcanzar: en vez de un `false` mudo, deja el material para que
	 * una persona reproduzca el paso a mano — captura, texto visible y los elementos tocables.
	 */
	async captureUnblockPath(surfaceLabel: string): Promise<{
		shot: ScreenshotRef;
		url: string;
		visibleText: string;
		tappables: { tag: string; text: string; classes: string; id: string }[];
		blockers: Blocker[];
	}> {
		const shot = await this.capture(`bloqueo-${surfaceLabel}`);
		const url = (await this.driver.execute(() => window.location.href).catch(() => '')) as string;
		const visibleText = (await this.driver.execute(() =>
			(document.body.innerText ?? '').replace(/\s+/g, ' ').slice(0, 1200)
		)) as string;
		const tappables = (await this.driver.execute(() => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			return Array.from(
				document.querySelectorAll('button, ion-button, ion-item, ion-tab-button, [role="button"], ion-fab-button, a')
			)
				.filter(vis)
				.map(el => {
					const e = el as HTMLElement;
					return {
						tag: e.tagName.toLowerCase(),
						text: (e.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 44),
						classes: (e.className ?? '').toString().slice(0, 70),
						id: e.id ?? ''
					};
				})
				.filter(e => e.text.length > 0 || e.id.length > 0)
				.slice(0, 40);
		})) as { tag: string; text: string; classes: string; id: string }[];
		const blockers = await this.describeBlockers();
		return { shot, url, visibleText, tappables, blockers };
	}

	async writeManifest(outPath: string): Promise<void> {
		await mkdir(path.dirname(outPath), { recursive: true });
		await writeFile(outPath, JSON.stringify(this.shots, null, 2), 'utf8');
	}
}
