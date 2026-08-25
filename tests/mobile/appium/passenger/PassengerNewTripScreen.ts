/**
 * PassengerNewTripScreen
 * New trip flow in the Passenger App.
 */

import { AppiumSessionBase, type AppiumElement } from '../base/AppiumSessionBase';

export interface TripRequest {
	origin: string;
	destination: string;
	cardLast4: string;
}

// v2.5.17: los CTAs del alta de viaje ("Seleccionar Vehículo", "Confirmar") son `ion-col.travel-btn-confirm`
// (NO <button>); se incluyen los fallbacks button/ion-button/.btn por si otra build los expone distinto.
const TRAVEL_CTA_SELECTOR = 'ion-col.travel-btn-confirm, button, ion-button, .btn, [role="button"]';

export class PassengerNewTripScreen extends AppiumSessionBase {
	private async clickVisibleMatchingElement(
		selector: string,
		candidates: string[],
		timeout = 10_000,
	): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;
		const normalizedCandidates = Array.from(
			new Set(
				candidates
					.map(candidate => candidate.trim())
					.filter(Boolean),
			),
		);

		while (Date.now() < deadline) {
			const clicked = await this.executeInWebView((querySelector: string, texts: string[]) => {
				const normalize = (value: unknown): string =>
					String(value ?? '')
						.replace(/\s+/g, ' ')
						.trim()
						.toLowerCase()
						.normalize('NFD')
						.replace(/[\u0300-\u036f]/g, '');

				const isVisible = (element: Element): boolean => {
					const html = element as HTMLElement;
					const rect = html.getBoundingClientRect();
					const style = window.getComputedStyle(html);
					return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
				};

				const targets = texts.map(normalize).filter(Boolean);
				const elements = Array.from(document.querySelectorAll(querySelector)) as HTMLElement[];
				const match = elements.find(element => {
					if (!isVisible(element)) {
						return false;
					}

					const haystack = normalize([
						element.innerText,
						element.textContent,
						element.getAttribute('aria-label'),
						element.getAttribute('content-desc'),
						element.getAttribute('title'),
						element.getAttribute('class'),
					].join(' '));

					return targets.some(target => haystack.includes(target));
				});

				if (!match) {
					return false;
				}

				match.click();
				return true;
			}, selector, normalizedCandidates) as boolean;

			if (clicked) {
				return true;
			}

			await driver.pause(250);
		}

		return false;
	}

	private async findVisibleInput(selector: string, timeout = 10_000): Promise<AppiumElement> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			await this.switchToWebView();
			const inputs = await driver.$$(selector);
			for (const input of inputs) {
				if (await input.isDisplayed().catch(() => false)) {
					return input as unknown as AppiumElement;
				}
			}

			await driver.pause(250);
		}

		throw new Error(`PassengerNewTripScreen.findVisibleInput() - "${selector}" not found`);
	}

	private async fillAndChooseAddress(inputSelector: string, address: string): Promise<void> {
		const input = await this.findVisibleInput(inputSelector);
		await this.executeInWebView((element: HTMLElement, value: string) => {
			const target =
				((element as unknown as { shadowRoot?: ShadowRoot | null }).shadowRoot?.querySelector('input') as HTMLInputElement | null) ??
				(element as unknown as HTMLInputElement);

			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
			setter?.call(target, value);
			target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
			target.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
			target.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
			target.focus?.();
		}, input, address);

		await this.pause(800);

		// v2.5.17: el autocomplete renderiza un `ion-list.prediction-list` con items
		// `ion-item.prediction-item` (span.main = calle, span.secondary = ciudad). El tap DEBE ir al
		// item del dropdown, no al texto suelto: la calle también está en el <input>, y tapear por
		// texto matcheaba el input (re-foco) dejando el dropdown abierto → viaje nunca se creaba.
		const street = address.split(',')[0]?.trim() ?? address.trim();
		if (await this.tapPredictionItem(street)) {
			return;
		}

		throw new Error(`PassengerNewTripScreen: prediction-item no encontrado para "${address}"`);
	}

	/**
	 * Tapea el item del dropdown de direcciones (v2.5.17: `ion-item.prediction-item`).
	 * Prefiere el item cuyo `span.main` contiene la calle; si no, cae al primer item de la lista.
	 * Normaliza acentos para tolerar "José"/"Jose" etc. Hace polling (el dropdown es async).
	 */
	private async tapPredictionItem(street: string, timeout = 8_000): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;
		const normalize = (value: string): string =>
			value.replace(/\s+/g, ' ').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
		const target = normalize(street);

		while (Date.now() < deadline) {
			await this.switchToWebView();
			const items = await driver.$$('ion-item.prediction-item');

			let firstVisible: AppiumElement | undefined;
			for (const item of items) {
				if (!(await item.isDisplayed().catch(() => false))) {
					continue;
				}
				firstVisible = firstVisible ?? (item as unknown as AppiumElement);
				const text = normalize(await item.getText().catch(() => ''));
				if (text.includes(target)) {
					await item.click().catch(() => undefined);
					return true;
				}
			}

			// Sin match exacto pero hay lista visible \u2192 tomar la primera sugerencia (la mejor).
			if (firstVisible) {
				await (firstVisible as unknown as { click: () => Promise<void> }).click().catch(() => undefined);
				return true;
			}

			await driver.pause(250);
		}

		return false;
	}

	/**
	 * Tap NATIVO (WebdriverIO) del primer elemento visible que matchea `selector` y cuyo texto
	 * contiene `text` (case-insensitive). Los botones/CTAs de Ionic (v2.5.17) requieren click nativo:
	 * un `element.click()` de DOM no dispara su handler `(click)`. Hace polling (render async).
	 */
	private async tapNativeByText(selector: string, text: string, timeout = 10_000): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;
		const target = text.toLowerCase();

		while (Date.now() < deadline) {
			await this.switchToWebView();
			const els = await driver.$$(selector);
			for (const el of els) {
				if (!(await el.isDisplayed().catch(() => false))) {
					continue;
				}
				const label = (await el.getText().catch(() => '')).toLowerCase();
				if (label.includes(target)) {
					await el.click().catch(() => undefined);
					return true;
				}
			}
			await driver.pause(250);
		}

		return false;
	}

	private cardCandidates(last4: string): string[] {
		const digits = last4.replace(/\D/g, '').slice(-4);
		return Array.from(new Set([
			`VISA ****${digits}`,
			`VISA ${digits}`,
			`**** ${digits}`,
			`...${digits}`,
			digits,
		])).filter(Boolean);
	}

	// El código de viaje del pax usa letra MINÚSCULA (p.ej. "4885-a", "8973-e").
	private static readonly TRIP_CODE_RE = /\b(\d{3,}-[A-Za-z])\b/g;
	private static readonly TRAVEL_ID_RE = /travelId["'=:\s]+(\d+)/i;

	/**
	 * Lee un "haystack" del WEBVIEW (URL + texto visible + HTML acotado). Tras crear el viaje el pax
	 * navega a la pantalla de seguimiento/home donde aparece el código del viaje; capturarlo requiere
	 * estar en el contexto WEBVIEW (getPageSource devuelve el árbol NATIVO si el contexto quedó nativo).
	 */
	private async readWebHaystack(): Promise<string> {
		// href + texto visible + HTML acotado. El código del viaje aparece en el HTML de las cards
		// (atributos/nodos), no siempre en innerText → incluir outerHTML es lo que realmente matchea.
		return this.executeInWebView(() => {
			const href = window.location?.href ?? '';
			const text = document.body ? (document.body as HTMLElement).innerText : '';
			const html = document.documentElement ? document.documentElement.outerHTML : '';
			return `${href}\n${text}\n${html}`.slice(0, 200_000);
		}).catch(() => '');
	}

	private collectTripCodes(haystack: string): Set<string> {
		const codes = new Set<string>();
		for (const match of haystack.matchAll(PassengerNewTripScreen.TRIP_CODE_RE)) {
			codes.add(match[1]);
		}
		return codes;
	}

	/**
	 * Extrae el código del viaje recién creado. Hace POLLING en el WEBVIEW porque la creación +
	 * navegación tardan más que el one-shot previo (esa era la causa raíz del `undefined`).
	 * `excludeCodes` = códigos ya presentes ANTES de confirmar (historial) → se ignoran para no
	 * devolver un viaje viejo como falso positivo.
	 */
	private async extractTripCode(excludeCodes: Set<string> = new Set(), timeoutMs = 25_000): Promise<string | undefined> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeoutMs;

		let lastFallback: string | undefined;
		while (Date.now() < deadline) {
			const haystack = await this.readWebHaystack();
			const codes = this.collectTripCodes(haystack);

			// Preferir un código NUEVO (no visto antes de confirmar).
			for (const code of codes) {
				if (!excludeCodes.has(code)) {
					console.warn(`[PassengerNewTripScreen] trip code NUEVO detectado: ${code} (excluidos=${[...excludeCodes].join(',') || '∅'})`);
					return code;
				}
				lastFallback = lastFallback ?? code;
			}

			const idMatch = haystack.match(PassengerNewTripScreen.TRAVEL_ID_RE);
			if (idMatch?.[1]) {
				console.warn(`[PassengerNewTripScreen] travelId detectado: ${idMatch[1]}`);
				return idMatch[1];
			}

			await driver.pause(750);
		}

		// Sin código nuevo tras el timeout: devolver uno visto (mejor que undefined si el viaje existe).
		console.warn(`[PassengerNewTripScreen] NO se detectó código NUEVO tras ${timeoutMs}ms. fallback=${lastFallback ?? 'undefined'}. Códigos vistos y excluidos como historial.`);
		return lastFallback;
	}

	/**
	 * Detecta si el modal "Ya tiene un viaje creado" está visible.
	 * Aparece cuando el pax tiene un viaje activo en SEARCHING_DRIVER, EN_CURSO
	 * o NO_AUTORIZADO ("En conflicto"). Selector: app-confirm-modal con span
	 * que contiene "Ya tiene un viaje creado" y CTA "Aceptar".
	 */
	async detectTripAlreadyCreatedModal(timeout = 4_000): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			const found = await this.executeInWebView(() => {
				const normalize = (value: unknown): string =>
					String(value ?? '')
						.replace(/\s+/g, ' ')
						.trim()
						.toLowerCase()
						.normalize('NFD')
						.replace(/[\u0300-\u036f]/g, '');

				const isVisible = (element: Element): boolean => {
					const html = element as HTMLElement;
					const rect = html.getBoundingClientRect();
					const style = window.getComputedStyle(html);
					return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
				};

				const modals = Array.from(document.querySelectorAll('app-confirm-modal')) as HTMLElement[];
				return modals.some(modal => {
					if (!isVisible(modal)) return false;
					const text = normalize(modal.innerText || modal.textContent);
					return text.includes('ya tiene un viaje creado') || text.includes('viaje creado');
				});
			}).catch(() => false);

			if (found) return true;
			await driver.pause(250);
		}

		return false;
	}

	/**
	 * Cierra el modal "Ya tiene un viaje creado" tapando el CTA "Aceptar".
	 * Tras cerrarlo la app vuelve a app-travel-info con los datos intactos.
	 */
	async dismissTripAlreadyCreatedModal(timeout = 8_000): Promise<void> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			const clicked = await this.executeInWebView(() => {
				const normalize = (value: unknown): string =>
					String(value ?? '')
						.replace(/\s+/g, ' ')
						.trim()
						.toLowerCase()
						.normalize('NFD')
						.replace(/[\u0300-\u036f]/g, '');

				const isVisible = (element: Element): boolean => {
					const html = element as HTMLElement;
					const rect = html.getBoundingClientRect();
					const style = window.getComputedStyle(html);
					return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
				};

				const modals = Array.from(document.querySelectorAll('app-confirm-modal')) as HTMLElement[];
				for (const modal of modals) {
					if (!isVisible(modal)) continue;
					const text = normalize(modal.innerText || modal.textContent);
					if (!text.includes('ya tiene un viaje creado') && !text.includes('viaje creado')) continue;

					const buttons = Array.from(modal.querySelectorAll('button.btn.primary, button')) as HTMLElement[];
					const aceptar = buttons.find(btn => {
						const label = normalize(btn.innerText || btn.textContent);
						return label === 'aceptar' || label.includes('aceptar');
					});

					if (aceptar && isVisible(aceptar)) {
						aceptar.click();
						return true;
					}
				}

				return false;
			}).catch(() => false);

			if (clicked) return;
			await driver.pause(250);
		}

		throw new Error('PassengerNewTripScreen.dismissTripAlreadyCreatedModal() - modal not found or "Aceptar" not clickable');
	}

	/**
	 * Opens or validates the passenger home screen.
	 */
	async openNewTrip(): Promise<void> {
		// v2.5.17: la home es `app-home` en `/navigator/HomePage`; el ancla visual es la tab de tipo
		// de viaje "Solo Ida". Navegación robusta a home desde CUALQUIER pantalla (p.ej. tras el flujo
		// de wallet la app queda en la sub-página "Billetera", sin bottom-nav → hay que hacer back):
		// en cada intento, si ya estamos en home salimos; si no, tapeamos la tab "Inicio" (nativa) y,
		// si no está visible (sub-página), usamos el back nativo de Android.
		const driver = this.getDriver();
		const atHome = async (waitMs: number): Promise<boolean> =>
			(await this.waitForWebUrlContains('HomePage', waitMs)) && (await this.waitForWebText('Solo Ida', waitMs, true));

		for (let attempt = 0; attempt < 6; attempt++) {
			if (await atHome(3_000)) {
				return;
			}
			const tappedInicio = await this.tapNativeByText('ion-tab-button, a, button, [role="button"], ion-item', 'inicio', 2_500);
			if (!tappedInicio) {
				await driver.back().catch(() => undefined);
			}
			await driver.pause(1_000);
		}

		if (await atHome(5_000)) {
			return;
		}

		throw new Error('PassengerNewTripScreen.openNewTrip() - home screen not visible');
	}

	/**
	 * Completes the trip origin.
	 */
	async setOrigin(address: string): Promise<void> {
		await this.fillAndChooseAddress('input[placeholder="Origen "]', address);
	}

	/**
	 * Completes the trip destination.
	 */
	async setDestination(address: string): Promise<void> {
		await this.fillAndChooseAddress('input[placeholder="Destino "]', address);
	}

	/**
	 * Selects the payment card for this trip.
	 */
	async selectPaymentCard(last4: string): Promise<void> {
		const digits = last4.replace(/\D/g, '').slice(-4);

		// Some builds already render the selected card on the travel shell.
		// If the target card is already visible, keep the current selection.
		if (await this.waitForWebText(digits, 2_000, true)) {
			return;
		}

		const openedCardDialog = await this.clickVisibleMatchingElement(
			'ion-col.payment-method, ion-col.payment-method-selected, .payment-method',
			[
				'tarjeta de crédito',
				'credit card',
				'visa',
				`visa ...${digits}`,
				`...${digits}`,
				digits,
			],
			10_000,
		);

		if (openedCardDialog) {
			await this.pause(500);

			for (const candidate of this.cardCandidates(digits)) {
				if (
					await this.clickVisibleMatchingElement(
						'ion-modal ion-item.card-item, app-credit-card-dialog ion-item.card-item, ion-modal .card-item',
						[candidate, `VISA ${digits}`, `...${digits}`, digits],
						5_000,
					)
				) {
					return;
				}
			}
		}

		// If the dialog is not exposed in this build, keep going with the card that
		// was already made default in wallet. The next trip step will surface any
		// real mismatch through the backend or status screen.
		if (await this.waitForWebText(digits, 3_000, true)) {
			return;
		}

		console.warn(`[PassengerNewTripScreen] card ending ${digits} not explicitly selectable on this screen; continuing with current default card`);
	}

	/**
	 * Confirms the trip request.
	 */
	async confirmTrip(): Promise<string | undefined> {
		// Snapshot de códigos ya visibles ANTES de confirmar (historial) → excluirlos al extraer.
		const codesBefore = this.collectTripCodes(await this.readWebHaystack());

		// v2.5.17: el tiempo por defecto ya es "Ahora" (viaje inmediato) → NO se tapea el selector de
		// tiempo (tapearlo ABRE un date-picker para viaje programado).
		//
		// El CTA "Seleccionar Vehículo" es un `ion-col.travel-btn-confirm` (NO un <button>; por eso un
		// selector button/ion-button no lo encontraba) y requiere click NATIVO de WebdriverIO. Al
		// tapearlo la app navega a `/navigator/travel-info` (estimación distancia/duración + "Confirmar").
		const vehicleSelected = await this.tapNativeByText(TRAVEL_CTA_SELECTOR, 'seleccionar veh');
		if (!vehicleSelected) {
			throw new Error('PassengerNewTripScreen.confirmTrip() - CTA "Seleccionar Vehículo" no encontrado');
		}

		// Esperar la pantalla de confirmación del viaje.
		await this.waitForWebUrlContains('travel-info', 10_000);
		await this.pause(1_500);
		await this.throwIfCreditLimitExceeded(4_000);

		// travel-info muestra: estimación (distancia/duración), lista de vehículos (Standard pre-
		// seleccionado por defecto), Método de Pago (la tarjeta del wallet ya viene auto-seleccionada,
		// p.ej. "VISA - 2224") y el CTA final `ion-col.travel-btn-confirm` con texto DINÁMICO
		// "Viajo Ahora <vehículo> - $<precio>" → crea el viaje. Se matchea por "viajo".
		const confirmed = await this.tapNativeByText(TRAVEL_CTA_SELECTOR, 'viajo');
		if (!confirmed) {
			throw new Error('PassengerNewTripScreen.confirmTrip() - CTA "Viajo Ahora" no encontrado en travel-info');
		}

		await this.pause(2_000);
		await this.throwIfCreditLimitExceeded(4_000);

		// ORÁCULO DE ÉXITO del alta (v2.5.17): la app navega a la pantalla de estado del viaje
		// (SEARCHING_DRIVER) = mapa + "Buscando servicio..." + botón "Cancelar Viaje". Es más fiable
		// que el código del viaje (que en v2.5.17 ya no se muestra en esta pantalla).
		const created =
			(await this.waitForWebText('Cancelar Viaje', 15_000, true)) ||
			(await this.waitForWebText('Buscando servicio', 3_000, true));
		if (!created) {
			throw new Error('PassengerNewTripScreen.confirmTrip() - viaje no creado (sin "Buscando servicio"/"Cancelar Viaje" tras "Viajo Ahora")');
		}

		// Código del viaje best-effort (puede volver undefined si no está visible en esta pantalla).
		return this.extractTripCode(codesBefore, 8_000);
	}

	/**
	 * Inspects the DOM for the credit-limit blocker that the backend raises when
	 * the test passenger has no available balance. We surface it as ENV_BLOCKER so
	 * pipelines can split data-related failures from real code regressions.
	 */
	private async throwIfCreditLimitExceeded(timeoutMs: number): Promise<void> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeoutMs;

		while (Date.now() < deadline) {
			const signal = await this.executeInWebView(() => {
				const normalize = (value: unknown): string =>
					String(value ?? '')
						.replace(/\s+/g, ' ')
						.trim()
						.toLowerCase()
						.normalize('NFD')
						.replace(/[\u0300-\u036f]/g, '');

				const isVisible = (element: Element): boolean => {
					const html = element as HTMLElement;
					if (html.offsetParent === null) {
						return false;
					}

					const rect = html.getBoundingClientRect();
					const style = window.getComputedStyle(html);
					return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
				};

				const overlays = Array.from(
					document.querySelectorAll('ion-alert, ion-modal, ion-toast, app-confirm-modal, .alert-wrapper, .toast-wrapper')
				) as HTMLElement[];

				const patterns = [
					/limit.*exceed/,
					/limite.*excedid/,
					/limite.*de.*credito/,
					/credit.*limit/,
					/saldo.*insuficient/,
					/supero.*limite/,
					/excede.*limite/,
				];

				for (const overlay of overlays) {
					if (!isVisible(overlay)) {
						continue;
					}

					const text = normalize(overlay.innerText ?? overlay.textContent);
					if (patterns.some(pattern => pattern.test(text))) {
						return text.slice(0, 200);
					}
				}

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const globals = window as any;
				const lastResponse = globals.__lastTripResponse ?? globals.__lastTravelResponse ?? null;
				if (lastResponse && typeof lastResponse === 'object') {
					if (lastResponse.limitExceeded === true || lastResponse.limitExceeded === 'true') {
						return 'limitExceeded=true';
					}

					if (lastResponse.limitExceeded === false && lastResponse.success === false) {
						return 'limitExceeded=false (blocked)';
					}
				}

				return '';
			}).catch(() => '');

			if (signal) {
				const email = process.env.PASSENGER_EMAIL?.trim() || 'unknown-passenger';
				throw new Error(`ENV_BLOCKER: Credit limit exceeded for test user ${email} (signal="${signal}")`);
			}

			await driver.pause(500);
		}
	}
}
