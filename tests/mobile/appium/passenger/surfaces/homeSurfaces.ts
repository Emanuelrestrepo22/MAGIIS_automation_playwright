/**
 * Navegadores de superficie de App PAX — donde vive un campo de direccion y como llegar.
 *
 * Cada superficie sabe tres cosas y nada mas: llegar, decir cual es su input, y dejar la app en un
 * estado del que la superficie siguiente pueda arrancar. La conducta la mide `AddressFieldProbe`,
 * que es la misma para todas — de eso se trata la matriz: si el campo se comporta distinto segun
 * donde este montado, la diferencia es el hallazgo.
 *
 * SELECTORES TOMADOS DEL CENSO del 2026-08-18 sobre `com.magiis.app.uat.passenger` v2.5.19.
 * Ninguno esta adivinado: la primera iteracion del censo navego por regex sobre clases y texto, no
 * salio nunca del home y encima borro el campo Origen. Estos salen del volcado real del DOM.
 */

import type { AddressSurface } from '../AddressFieldProbe';

const HOME_URL_RE = /HomePage/i;

/** Los placeholders llevan ESPACIO FINAL. Verificado sin `trim()` en test y en uat. */
export const ORIGIN_SELECTOR = 'input[placeholder="Origen "]';
export const DESTINATION_SELECTOR = 'input[placeholder="Destino "]';

async function url(driver: WebdriverIO.Browser): Promise<string> {
	return (await driver.execute(() => window.location.href).catch(() => '')) as string;
}

/** Tap nativo: el `.click()` del DOM no dispara los handlers de Ionic en esta app. */
async function tapNative(driver: WebdriverIO.Browser, selector: string, needle: string, timeout = 8000): Promise<boolean> {
	const target = needle.toLowerCase();
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		let els: unknown[] = [];
		try {
			els = (await driver.$$(selector)) as unknown as unknown[];
		} catch {
			els = [];
		}
		for (const el of els as { isDisplayed: () => Promise<boolean>; getText: () => Promise<string>; click: () => Promise<void> }[]) {
			try {
				if (!(await el.isDisplayed())) continue;
				if (!(await el.getText()).toLowerCase().includes(target)) continue;
				await el.click();
				await driver.pause(1800);
				return true;
			} catch {
				// el nodo se re-renderizo entre la lectura y el tap
			}
		}
		await driver.pause(300);
	}
	return false;
}

/** Toca la flecha de retroceso del encabezado. Es la UNICA salida de las paginas internas. */
async function tapBackArrow(driver: WebdriverIO.Browser): Promise<boolean> {
	const tapped = (await driver
		.execute(() => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const el = Array.from(document.querySelectorAll('ion-back-button, ion-icon, .arrow-back, ion-buttons ion-button'))
				.filter(vis)
				.find(e => {
					const n = `${e.getAttribute('name') ?? ''} ${e.getAttribute('ng-reflect-name') ?? ''} ${e.className} ${e.getAttribute('aria-label') ?? ''}`;
					return /arrow-back|arrow_back|chevron-back|back-button/i.test(n);
				}) as HTMLElement | undefined;
			if (!el) return false;
			el.click();
			return true;
		})
		.catch(() => false)) as boolean;
	if (tapped) await driver.pause(1800);
	return tapped;
}

/**
 * Vuelve al home.
 *
 * La primera version solo buscaba la tab "Inicio", y por eso la bateria entera murio: la app habia
 * quedado en `/AddressesPage`, donde las tabs inferiores NO se renderizan y la unica salida es la
 * flecha del encabezado. Ahora prueba las dos vias, en el orden en que las usa una persona.
 */
async function goHome(driver: WebdriverIO.Browser): Promise<boolean> {
	for (let i = 0; i < 5; i++) {
		if (HOME_URL_RE.test(await url(driver))) return true;
		if (await tapBackArrow(driver)) continue;
		if (await tapNative(driver, 'ion-tab-button, ion-label', 'inicio', 3000)) continue;
		break;
	}
	return HOME_URL_RE.test(await url(driver));
}

type FieldState = { present: boolean; readOnly: boolean; value: string };

async function fieldState(driver: WebdriverIO.Browser, selector: string): Promise<FieldState> {
	return (await driver.execute((sel: string) => {
		const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const t = Array.from(document.querySelectorAll(sel)).filter(vis)[0] as HTMLInputElement | undefined;
		if (!t) return { present: false, readOnly: false, value: '' };
		return { present: true, readOnly: t.readOnly, value: t.value };
	}, selector)) as FieldState;
}

/**
 * Un campo con un lugar ya elegido queda READONLY: setearle `.value` no dispara nada y la conducta
 * se mediria sobre un campo inerte — el falso negativo que hay que evitar.
 *
 * Y no alcanza con tocar el input: cuando esta ocupado lleva `class="no-pointer"` y encima hay un
 * `div.trailing-icon` que se come el tap. Appium lo dice literal:
 *   `element click intercepted: <input ... class="no-pointer"> is not clickable at point (170,316).
 *    Other element would receive the click: <div class="trailing-icon ...">`
 * Asi que se toca lo que el usuario toca — el icono de la fila o la fila entera —, en ese orden, y
 * recien despues se comprueba por el DOM si el campo quedo editable. No se asume que el tap sirvio.
 */
async function ensureEditable(driver: WebdriverIO.Browser, selector: string): Promise<boolean> {
	const before = await fieldState(driver, selector);
	if (!before.present) return false;
	if (!before.readOnly) return true;

	/**
	 * Devuelve el rect del elemento a tocar, en coordenadas CSS del WebView.
	 *
	 * ⚠ NUNCA se toca el icono lateral de la fila. En esta pantalla ese icono es un **tacho de
	 * borrar**: una version anterior de este helper lo incluia entre los objetivos, y tocarlo a
	 * ciegas habria eliminado la direccion de origen del usuario. Los unicos objetivos permitidos
	 * son el area de texto de la fila y el input, que es lo que toca una persona para editar.
	 *
	 * El input lleva `pointer-events: none` cuando esta inactivo (`class="no-pointer"`), asi que un
	 * tap sobre sus coordenadas atraviesa hasta la fila — que es justo el efecto buscado.
	 */
	const rectOf = async (kind: 'text' | 'row' | 'input'): Promise<{ x: number; y: number; vw: number; vh: number } | null> =>
		(await driver
			.execute(
				(sel: string, k: string) => {
					const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
					const input = Array.from(document.querySelectorAll(sel)).filter(vis)[0] as HTMLElement | undefined;
					if (!input) return null;
					let target: HTMLElement | null = input;
					if (k === 'row') {
						target = (input.closest('ion-item, ion-row, .travel-edit-input') as HTMLElement) ?? null;
					}
					if (!target) return null;
					const r = target.getBoundingClientRect();
					if (r.width === 0 || r.height === 0) return null;
					// Para 'text' se apunta al TERCIO IZQUIERDO, lejos de cualquier icono de accion
					// que viva a la derecha de la fila.
					const x = k === 'text' ? r.left + r.width * 0.25 : r.left + r.width / 2;
					return { x, y: r.top + r.height / 2, vw: window.innerWidth, vh: window.innerHeight };
				},
				selector,
				kind
			)
			.catch(() => null)) as { x: number; y: number; vw: number; vh: number } | null;

	for (const kind of ['text', 'row', 'input'] as const) {
		const rect = await rectOf(kind);
		if (!rect) continue;
		await tapAtCssPoint(driver, rect);
		await driver.pause(2000);
		const after = await fieldState(driver, selector);
		if (after.present && !after.readOnly) return true;
	}
	return false;
}

/**
 * Tap NATIVO en un punto expresado en coordenadas CSS del WebView.
 * El `.click()` del DOM no dispara los handlers de Ionic, y el `.click()` de WebdriverIO sobre el
 * input choca con el elemento que lo tapa. Mapear CSS -> pantalla y tocar ahi es lo unico que
 * reproduce lo que hace un dedo.
 */
async function tapAtCssPoint(
	driver: WebdriverIO.Browser,
	rect: { x: number; y: number; vw: number; vh: number }
): Promise<void> {
	const ctx = (await driver.getContext()) as string;
	await driver.switchContext('NATIVE_APP');
	try {
		let ox = 0;
		let oy = 0;
		let sw = 0;
		let sh = 0;
		try {
			const wv = (await driver.$('//android.webkit.WebView')) as unknown as {
				getLocation: () => Promise<{ x: number; y: number }>;
				getSize: () => Promise<{ width: number; height: number }>;
			};
			const loc = await wv.getLocation();
			const sz = await wv.getSize();
			ox = loc.x;
			oy = loc.y;
			sw = sz.width;
			sh = sz.height;
		} catch {
			sw = 0;
		}
		if (!sw || !sh) {
			const size = await driver.getWindowSize();
			sw = size.width;
			sh = size.height;
		}
		const x = Math.round(ox + rect.x * (sw / rect.vw));
		const y = Math.round(oy + rect.y * (sh / rect.vh));
		await driver.performActions([
			{
				type: 'pointer',
				id: 'finger1',
				parameters: { pointerType: 'touch' },
				actions: [
					{ type: 'pointerMove', duration: 0, x, y },
					{ type: 'pointerDown', button: 0 },
					{ type: 'pause', duration: 120 },
					{ type: 'pointerUp', button: 0 }
				]
			}
		]);
		await driver.releaseActions().catch(() => undefined);
	} finally {
		await driver.switchContext(ctx);
	}
}

/** Deja el campo vacio sin tocar el resto del formulario. */
async function clearField(driver: WebdriverIO.Browser, selector: string): Promise<void> {
	await driver.execute((sel: string) => {
		const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const t = Array.from(document.querySelectorAll(sel)).filter(vis)[0] as HTMLInputElement | undefined;
		if (!t) return;
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
		setter?.call(t, '');
		t.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
		t.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
	}, selector);
	await driver.pause(500);
}

/** S1 — el campo de origen del home. Puede llegar readonly con el pick-up ya geolocalizado. */
export class HomeOriginSurface implements AddressSurface {
	readonly id = 'S1';
	readonly label = 'Home · Origen';

	async reach(driver: WebdriverIO.Browser): Promise<boolean> {
		if (!(await goHome(driver))) return false;
		return ensureEditable(driver, ORIGIN_SELECTOR);
	}

	fieldSelector(): string {
		return ORIGIN_SELECTOR;
	}

	async cleanup(driver: WebdriverIO.Browser): Promise<void> {
		await clearField(driver, ORIGIN_SELECTOR);
	}
}

/**
 * Superficie ADAPTATIVA: la primera fila de direccion del home que este editable.
 *
 * POR QUE HACE FALTA
 * El home mantiene **una sola fila activa**: la que se puede escribir lleva `class="allow-pointer"`
 * y las demas quedan `readonly` con `no-pointer`, sin importar si tienen valor. Cual es la activa
 * depende del estado en que quedo la app, asi que fijar la corrida a `Destino` la vuelve fragil:
 * una corrida anterior que dejo el foco en la fila de parada aborta la siguiente.
 *
 * Las tres filas montan **el mismo componente migrado**, asi que para medir las CONDUCTAS del
 * autocompletado da igual cual se use — lo que no da igual es mentir sobre cual se uso, por eso la
 * superficie expone `resolvedLabel` y el reporte lo imprime.
 *
 * No reemplaza a las superficies fijas: para comparar filas ENTRE si siguen sirviendo esas.
 */
export class AnyEditableAddressSurface implements AddressSurface {
	readonly id = 'SA';
	label = 'Home · primera fila de direccion editable';
	private resolved = '';
	/** Placeholder real de la fila que termino usandose. Va al reporte. */
	resolvedLabel = '';

	async reach(driver: WebdriverIO.Browser): Promise<boolean> {
		if (!(await goHome(driver))) return false;

		// 1. Si ya hay una editable, se usa esa.
		const found = await this.findEditable(driver);
		if (found) {
			this.applyFound(found);
			return true;
		}

		// 2. Si no, se intenta activar alguna tocando su area de texto (nunca el icono de accion).
		for (const sel of [DESTINATION_SELECTOR, ORIGIN_SELECTOR]) {
			if (await ensureEditable(driver, sel)) {
				const again = await this.findEditable(driver);
				if (again) {
					this.applyFound(again);
					return true;
				}
			}
		}
		return false;
	}

	private applyFound(found: { placeholder: string }): void {
		this.resolvedLabel = found.placeholder;
		this.resolved = `input[placeholder=${JSON.stringify(found.placeholder)}]`;
		this.label = `Home · ${found.placeholder.trim()}`;
	}

	private async findEditable(driver: WebdriverIO.Browser): Promise<{ placeholder: string } | null> {
		return (await driver.execute(() => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const hit = Array.from(document.querySelectorAll('input'))
				.filter(vis)
				.map(el => el as HTMLInputElement)
				.filter(i => /origen|destino/i.test(i.placeholder ?? ''))
				.find(i => !i.readOnly && !i.disabled);
			return hit ? { placeholder: hit.placeholder } : null;
		})) as { placeholder: string } | null;
	}

	fieldSelector(): string {
		return this.resolved;
	}

	async cleanup(driver: WebdriverIO.Browser): Promise<void> {
		if (this.resolved) await clearField(driver, this.resolved);
	}
}

/** S2 — el campo de destino del home. En el censo siempre llego editable. */
export class HomeDestinationSurface implements AddressSurface {
	readonly id = 'S2';
	readonly label = 'Home · Destino';

	async reach(driver: WebdriverIO.Browser): Promise<boolean> {
		if (!(await goHome(driver))) return false;
		return ensureEditable(driver, DESTINATION_SELECTOR);
	}

	fieldSelector(): string {
		return DESTINATION_SELECTOR;
	}

	async cleanup(driver: WebdriverIO.Browser): Promise<void> {
		await clearField(driver, DESTINATION_SELECTOR);
	}
}

/**
 * S3 — `Agregar otro destino`. El campo NO existe en el estado inicial: aparece recien despues de
 * fijar un destino (documentado en `docs/test-cases/mobile/TC-PAX-HOLD-STEPS.md:55`). Por eso su
 * `reach()` primero carga un destino y despues busca la fila nueva.
 *
 * Requiere una direccion valida del entorno: se toma de `MG116_SEED_DESTINATION` para no clavar un
 * literal que solo resuelve contra un carrier.
 */
export class HomeStopSurface implements AddressSurface {
	readonly id = 'S3';
	readonly label = 'Home · Agregar otro destino (parada)';
	private resolved = 'input[placeholder="Agregar otro destino "]';

	constructor(private readonly seedDestination: string) {}

	async reach(driver: WebdriverIO.Browser): Promise<boolean> {
		if (!(await goHome(driver))) return false;
		if (!(await ensureEditable(driver, DESTINATION_SELECTOR))) return false;

		// Cargar destino y elegir la primera prediccion: sin seleccion, la fila de parada no aparece.
		await driver.execute(
			(sel: string, v: string) => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const t = Array.from(document.querySelectorAll(sel)).filter(vis)[0] as HTMLInputElement | undefined;
				if (!t) return;
				const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
				setter?.call(t, v);
				t.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
				t.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
			},
			DESTINATION_SELECTOR,
			this.seedDestination
		);
		await driver.pause(4500);
		await tapNative(driver, 'ion-item.prediction-item', '', 6000).catch(() => false);
		await driver.pause(2500);

		const found = (await driver.execute(() => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const el = Array.from(document.querySelectorAll('input'))
				.filter(vis)
				.find(i => ((i as HTMLInputElement).placeholder ?? '').trim().toLowerCase().startsWith('agregar otro destino'));
			return el ? JSON.stringify((el as HTMLInputElement).placeholder) : null;
		})) as string | null;

		if (!found) return false;
		// El placeholder exacto sale del DOM, con su espacio final si lo tiene.
		this.resolved = `input[placeholder=${found}]`;
		return true;
	}

	fieldSelector(): string {
		return this.resolved;
	}

	async cleanup(driver: WebdriverIO.Browser): Promise<void> {
		await clearField(driver, this.resolved);
		await clearField(driver, DESTINATION_SELECTOR);
	}
}

/**
 * S7 — el campo de direccion del perfil, en `/AddressesPage`.
 *
 * DOS COSAS QUE COSTARON UNA CORRIDA ENTERA:
 *
 * 1. `Mis Direcciones` NO es un panel del home: es una PAGINA propia (`/AddressesPage`). En el censo
 *    parecia un panel porque el boton del home figuraba `active`, pero la corrida siguiente arranco
 *    con la app ya en esa URL.
 *
 * 2. **El campo `Direccion` esta DESHABILITADO hasta elegir un `Tipo`.** Comprobado visualmente
 *    (input gris, `Guardar` gris) y por el DOM: no aparece entre los elementos interactivos hasta
 *    que el `ion-select#inputAddressType` tiene valor. Sin ese paso previo, el autocompletado de esta
 *    superficie **no se puede ejercer**, y una corrida que no lo sepa reporta "campo no encontrado"
 *    cuando lo que hay es una precondicion de formulario.
 *
 * Las opciones del selector dependen de lo ya guardado: `Casa` desaparece si ya existe una direccion
 * de casa, asi que se elige la primera opcion disponible en vez de un literal.
 */
/**
 * S6 — el campo de direccion de la EDICION de un viaje programado.
 *
 * COMO SE LLEGA (censado en vivo, no supuesto): tab `Actividad` -> segmento `Programados` -> el
 * control de edicion de la tarjeta del viaje. Ese control es un `<div class="edit">` de 60x60 px
 * **sin ningun texto** (el rotulo es un SVG), vecino de `cancel-row`. Cualquier navegacion que
 * busque la palabra "Editar" no lo encuentra nunca y la superficie se reporta inalcanzable con el
 * producto perfectamente sano — fue exactamente lo que le pasaba al guard TM-730.
 *
 * PRECONDICION DE DATO: tiene que existir al menos un viaje programado. Si `Programados` esta vacia
 * la superficie devuelve `false`, que el probe traduce a NO_EJERCIDO y nunca a defecto. Para crear
 * uno esta `scripts/passenger-schedule-trip.ts` + `scripts/passenger-confirm-scheduled-trip.ts`
 * (cuenta corriente o efectivo, nunca tarjeta).
 */
export class ScheduledTripEditSurface implements AddressSurface {
	readonly id = 'S6';
	readonly label = 'Editar viaje programado';
	private resolved = '';

	async reach(driver: WebdriverIO.Browser): Promise<boolean> {
		if (!/travel-edit/i.test(await url(driver))) {
			if (!(await tapNative(driver, 'ion-tab-button, ion-label', 'actividad', 8000))) return false;
			await driver.pause(2500);
			if (!(await tapNative(driver, 'ion-segment-button, ion-label', 'programados', 6000))) return false;
			await driver.pause(2500);

			// El icono de edicion, por CSS: no tiene texto que buscar.
			const rect = (await driver
				.execute(() => {
					const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
					const el = Array.from(document.querySelectorAll('div.edit, .col-edit div, .col-edit')).filter(vis)[0] as
						| HTMLElement
						| undefined;
					if (!el) return null;
					el.scrollIntoView({ block: 'center' });
					const b = el.getBoundingClientRect();
					if (!b.width || !b.height) return null;
					return { x: b.left + b.width / 2, y: b.top + b.height / 2, vw: window.innerWidth, vh: window.innerHeight };
				})
				.catch(() => null)) as { x: number; y: number; vw: number; vh: number } | null;
			if (!rect) return false;
			await tapAtCssPoint(driver, rect);
			await driver.pause(3500);
			if (!/travel-edit/i.test(await url(driver))) return false;
		}

		// En `travel-edit` valen las mismas tres filas del home: se toma la que este editable.
		for (const sel of [
			'input[placeholder="Agregar otro destino "]',
			DESTINATION_SELECTOR,
			ORIGIN_SELECTOR,
			'input[name="input-from"]'
		]) {
			if (await ensureEditable(driver, sel)) {
				this.resolved = sel;
				return true;
			}
		}
		return false;
	}

	fieldSelector(): string {
		return this.resolved || 'input[name="input-from"]';
	}

	async cleanup(driver: WebdriverIO.Browser): Promise<void> {
		// Se sale SIN guardar: la edicion no debe alterar el viaje programado que sirve de fixture.
		if (this.resolved) await clearField(driver, this.resolved);
		await tapBackArrow(driver).catch(() => undefined);
	}
}

export class ProfileAddressSurface implements AddressSurface {
	readonly id = 'S7';
	readonly label = 'Perfil · Direcciones (alta/edicion)';
	private resolved = '';
	/** Queda registrado para el reporte: sin esto el campo no se habilita. */
	chosenType = '';

	async reach(driver: WebdriverIO.Browser): Promise<boolean> {
		// 1. Llegar a /AddressesPage. Puede que ya estemos ahi.
		//
		// OJO CON EL HOMONIMO: el home tiene un boton "Mis Direcciones"
		// (`button.travelHistory-btn.additional-btns-btn`) que NO es esta seccion — es un ATAJO que
		// lista las direcciones guardadas para elegir una como destino. La seccion del perfil, la que
		// tiene el formulario de alta/edicion, se alcanza por el tab "Mi cuenta". Apuntarle al atajo
		// dejaba la superficie inalcanzable con el producto perfectamente sano.
		if (!/AddressesPage/i.test(await url(driver))) {
			if (!(await goHome(driver))) return false;
			if (!(await tapNative(driver, 'ion-tab-button, ion-label', 'mi cuenta', 6000))) return false;
			await driver.pause(2000);
			if (!(await tapNative(driver, 'ion-item, ion-label, button', 'direccion', 6000))) return false;
			await driver.pause(2500);
			if (!/AddressesPage/i.test(await url(driver))) return false;
		}

		// 2. Habilitar el formulario eligiendo un Tipo. Es la precondicion real del campo.
		if (!(await this.pickAddressType(driver))) return false;

		// 3. Recien ahora el input de direccion deberia existir y ser usable.
		const sel = await this.findAddressInput(driver);
		if (!sel) return false;
		this.resolved = sel;
		return true;
	}

	/**
	 * Abre el `ion-select` de tipo y elige la primera opcion ofrecida.
	 * El popover de Ionic vive FUERA del `ion-select`, en su propio `ion-popover`, asi que la opcion
	 * se busca en todo el documento y no dentro del select.
	 */
	private async pickAddressType(driver: WebdriverIO.Browser): Promise<boolean> {
		const already = (await driver
			.execute(() => {
				const el = document.querySelector('#inputAddressType ion-select, ion-select') as
					| (HTMLElement & { value?: unknown })
					| null;
				return el && el.value ? String(el.value) : '';
			})
			.catch(() => '')) as string;
		if (already) {
			this.chosenType = already;
			return true;
		}

		await tapNative(driver, '#inputAddressType, ion-select, ion-item', 'tipo', 5000);
		await driver.pause(1800);

		const picked = (await driver
			.execute(() => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const opt = Array.from(
					document.querySelectorAll('ion-select-popover ion-item, ion-popover ion-item, ion-radio, ion-select-option')
				).filter(vis)[0] as HTMLElement | undefined;
				if (!opt) return '';
				const label = (opt.textContent ?? '').trim();
				opt.click();
				return label || 'opcion-1';
			})
			.catch(() => '')) as string;
		await driver.pause(1800);

		if (!picked) return false;
		this.chosenType = picked;
		return true;
	}

	/** Busca el input de direccion, excluyendo el del NOMBRE de la direccion. */
	private async findAddressInput(driver: WebdriverIO.Browser): Promise<string | null> {
		return (await driver.execute(() => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const inputs = Array.from(document.querySelectorAll('input')).filter(vis) as HTMLInputElement[];
			// `name="input-from"` es el del lugar; `name="input-name"` es el del nombre.
			const byName = inputs.find(i => (i.getAttribute('name') ?? '') === 'input-from');
			if (byName) return 'input[name="input-from"]';
			const byPlaceholder = inputs.find(i => /direcci|lugar|domicilio|address/i.test(i.placeholder ?? ''));
			if (byPlaceholder) return `input[placeholder=${JSON.stringify(byPlaceholder.placeholder)}]`;
			return null;
		})) as string | null;
	}

	fieldSelector(): string {
		return this.resolved || 'input[name="input-from"]';
	}

	async cleanup(driver: WebdriverIO.Browser): Promise<void> {
		// No se guarda nada: se sale del formulario sin confirmar para no crear direcciones en UAT.
		await tapNative(driver, 'ion-back-button, ion-icon, ion-button, button', 'cancelar', 2500).catch(() => false);
		await driver
			.execute(() => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const el = Array.from(document.querySelectorAll('ion-icon, ion-back-button, .arrow-back'))
					.filter(vis)
					.find(e => /arrow-back|arrow_back/i.test(`${e.getAttribute('name') ?? ''}${e.className}`)) as
					| HTMLElement
					| undefined;
				el?.click();
			})
			.catch(() => undefined);
		await driver.pause(1500);
	}
}
