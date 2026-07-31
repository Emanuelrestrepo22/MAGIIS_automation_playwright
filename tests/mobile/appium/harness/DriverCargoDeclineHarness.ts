/**
 * DriverCargoDeclineHarness
 * =========================
 * Orquesta la FASE DRIVER APP (Appium, dispositivo físico) del E2E híbrido
 * "Cargo a Bordo — decline/antifraud". Espeja el happy-path harness hasta el
 * checkpoint `resume`, y luego ejecuta el cobro Cargo a Bordo con una tarjeta
 * declinada, devolviendo el `PaymentOutcome` para que el spec haga el assert.
 *
 * Reutiliza los screens de flujo YA verificados en device (dumps 2026-04):
 *   DriverHomeScreen · DriverTripRequestScreen · DriverTripNavigationScreen · DriverTripSummaryScreen
 * y el screen bajo validación DriverTripPaymentScreen (modal Ionic nativo).
 *
 * La interacción específica de Cargo a Bordo en travel-resume (seleccionar el
 * método CREDIT_CARD por su icono + tap "Ingresar tarjeta") vive AQUÍ vía
 * driver.execute + click real, para NO modificar los screens verificados.
 *
 * Fuente del comportamiento (magiis-mobile-driver-v2):
 *   - travel-resume.html: `.travel-payment button.payment` (icon-only, ion-icon
 *     src=".../{VALUE}-black|white.svg"); footer `button.btn.finish` cuyo texto
 *     pasa a "Ingresar tarjeta" (travel_resume.enter_card) al elegir CREDIT_CARD.
 *   - travel-resume.ts closeTravel() → CREDIT_CARD → payTravelCreditCard() abre
 *     el modal CreditCardPaymentDataComponent.
 */

import type { AppiumDriver } from '../base/AppiumSessionBase';
import type { MobileActorConfig } from '../config/appiumRuntime';
import { DriverHomeScreen } from '../driver/DriverHomeScreen';
import { DriverTripRequestScreen } from '../driver/DriverTripRequestScreen';
import { DriverTripNavigationScreen } from '../driver/DriverTripNavigationScreen';
import { DriverTripSummaryScreen } from '../driver/DriverTripSummaryScreen';
import { DriverTripPaymentScreen, type CardData, type PaymentOutcome } from '../driver/DriverTripPaymentScreen';
import { dumpAppiumState } from '../helpers/appiumDebug';

export type DriverCargoDeclineResult = {
	outcome: PaymentOutcome;
	totalAmount: string;
	reachedPaymentModal: boolean;
};

export type DriverCargoDeclineOptions = {
	ensureDriverOnline?: boolean;
	/** Timeout para que el viaje llegue al conductor (TravelConfirmPage). */
	confirmTimeoutMs?: number;
	/** Caso always-3DS: tras COBRAR completar el challenge 3DS. */
	expect3ds?: boolean;
};

const DEFAULTS = {
	confirmTimeoutMs: 90_000,
	inProgressTimeoutMs: 60_000,
	resumeTimeoutMs: 60_000,
	paymentModalTimeoutMs: 30_000,
	outcomeTimeoutMs: 30_000
} as const;

export class DriverCargoDeclineHarness {
	private readonly home: DriverHomeScreen;
	private request: DriverTripRequestScreen | null = null;
	private navigation: DriverTripNavigationScreen | null = null;
	private summary: DriverTripSummaryScreen | null = null;
	private payment: DriverTripPaymentScreen | null = null;

	constructor(
		private readonly config: MobileActorConfig,
		driver?: AppiumDriver
	) {
		this.home = new DriverHomeScreen(this.config, driver);
		if (driver) this.bind(driver);
	}

	async startSession(): Promise<void> {
		if (!this.hasSession()) {
			await this.home.startSession();
		}
		this.bind(this.home.getDriver());
	}

	async endSession(): Promise<void> {
		await this.home.endSession();
	}

	/**
	 * PRE-WARM: abre la sesión Appium + deja al driver logueado y Disponible en /navigator/home.
	 * Se llama ANTES de que la fase web cree el viaje, para sacar el arranque de sesión (~10s) del
	 * camino crítico y ganarle al timer de cancelación del driver-candidato.
	 * newCommandTimeout alto (config APPIUM_NEW_COMMAND_TIMEOUT) mantiene la sesión viva durante la
	 * fase web sin comandos.
	 */
	async prewarm(options: DriverCargoDeclineOptions = {}): Promise<void> {
		await this.startSession();
		await this.dismissStaleModals();
		const ensureOnline = options.ensureDriverOnline ?? true;
		if (ensureOnline && !(await this.home.isDriverOnline())) {
			await this.home.goOnline();
		}

		// Verificar que el driver esté LIBRE en /navigator/home. Si está en un Travel*Page
		// (viaje en-progreso/to-start/resume de una corrida parcial previa), está OCUPADO y NO
		// recibirá nuevos offers → hay que limpiar ese viaje stale (app/API) antes de correr.
		const driver = this.home.getDriver();
		const contexts = (await driver.getContexts().catch(() => [])) as string[];
		const wv = contexts.find(c => c.startsWith('WEBVIEW'));
		if (wv) await driver.switchContext(wv);
		let url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
		if (/Travel(InProgress|ToStart|Resume|Confirm)Page/i.test(url)) {
			// Self-heal: un viaje stale de una corrida previa deja al driver OCUPADO (no recibe
			// offers). En lugar de abortar, lo liberamos in-situ para que cada test sea independiente.
			console.warn(`[PRE-WARM] Driver ocupado en ${url} — liberando viaje stale para no bloquear el test...`);
			await this.freeStaleTrip();
			url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
			if (/Travel(InProgress|ToStart|Resume|Confirm)Page/i.test(url)) {
				throw new Error(
					`[PRE-WARM] No se pudo liberar al driver del viaje stale (sigue en ${url}). ` +
						`Cancelar manualmente (app o API PUT travels/cancel) antes de reintentar.`
				);
			}
			console.log(`[PRE-WARM] Driver liberado → ${url}`);
		}
		console.log(`[DriverCargoDeclineHarness] PRE-WARM listo (driver online en ${url}, esperando viaje).`);
	}

	/**
	 * Libera al driver de un viaje stale atascado en TravelResumePage, sobre la sesión ya abierta:
	 * cicla los payment buttons y cierra el viaje con el botón de cierre que se habilite
	 * ("Cerrar Viaje"/"Firmar y Cerrar"). NO usa "Ingresar tarjeta" (queda disabled si total=0).
	 * Deja al driver de vuelta en /navigator/home. Espeja tests/mobile/appium/scripts/driver-free-stale-trip.ts
	 * pero sin abrir/cerrar sesión (reutiliza la del harness).
	 */
	private async freeStaleTrip(): Promise<void> {
		const driver = this.home.getDriver();
		await this.switchToWebView();
		const footer = async (): Promise<{ text: string; disabled: boolean }> =>
			driver
				.execute<{ text: string; disabled: boolean }, []>(() => {
					const norm = (v: unknown) =>
						String(v ?? '')
							.replace(/\s+/g, ' ')
							.trim();
					const r =
						document.querySelector('app-travel-resume:not(.ion-page-hidden)') ||
						document.querySelector('app-travel-resume');
					const b = r?.querySelector('ion-footer button.btn.finish') as HTMLButtonElement | null;
					return {
						text: b ? norm(b.innerText) : '',
						disabled: b ? b.disabled || b.getAttribute('disabled') !== null : true
					};
				})
				.catch(() => ({ text: '', disabled: true }));

		const u = await driver.execute<string, []>(() => window.location.href).catch(() => '');
		if (!/TravelResumePage/i.test(u)) return;

		const payCount = await driver
			.execute<number, []>(() => {
				const r =
					document.querySelector('app-travel-resume:not(.ion-page-hidden)') ||
					document.querySelector('app-travel-resume');
				return Array.from(r?.querySelectorAll('.travel-payment button.payment') || []).filter(
					b => (b as HTMLElement).offsetParent !== null
				).length;
			})
			.catch(() => 0);

		for (let i = 0; i < Math.max(payCount, 2); i++) {
			await driver
				.execute<boolean, [number]>(idx => {
					const r =
						document.querySelector('app-travel-resume:not(.ion-page-hidden)') ||
						document.querySelector('app-travel-resume');
					const pays = Array.from(r?.querySelectorAll('.travel-payment button.payment') || []).filter(
						b => (b as HTMLElement).offsetParent !== null
					) as HTMLElement[];
					if (!pays.length) return false;
					pays[idx % pays.length].click();
					return true;
				}, i)
				.catch(() => false);
			await driver.pause(3_000);
			const fs = await footer();
			if (!/ingresar tarjeta/i.test(fs.text) && !fs.disabled && fs.text.length > 0) {
				await driver
					.execute<boolean, []>(() => {
						const r =
							document.querySelector('app-travel-resume:not(.ion-page-hidden)') ||
							document.querySelector('app-travel-resume');
						const b = r?.querySelector('ion-footer button.btn.finish') as HTMLElement | null;
						if (b) {
							b.click();
							return true;
						}
						return false;
					})
					.catch(() => false);
				await driver.pause(4_000);
				break;
			}
		}
	}

	/**
	 * REACT: con la sesión YA pre-warm, espera el request entrante y ejecuta el cobro INMEDIATO.
	 * Instrumenta tiempos por tramo (evidencia para el análisis de timing vs cancelación).
	 */
	async reactAndCharge(card: CardData, options: DriverCargoDeclineOptions = {}): Promise<DriverCargoDeclineResult> {
		const confirmTimeout = options.confirmTimeoutMs ?? DEFAULTS.confirmTimeoutMs;
		let reachedPaymentModal = false;
		const t0 = Date.now();
		const mark = (m: string) =>
			console.log(`[DriverCargoDeclineHarness][t+${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

		const expect3ds = options.expect3ds ?? false;
		try {
			// 1. Request entrante (TravelConfirmPage / viaje asignado) → aceptar.
			mark('esperando request/asignación (TravelConfirmPage)...');
			const confirmReached = await this.getRequest().waitForTripConfirmPage(confirmTimeout);
			if (!confirmReached) {
				throw new Error(
					`No llegó/asignó ningún viaje al conductor (TravelConfirmPage) en ${confirmTimeout}ms. ` +
						`Verificar que la fase web creó y ASIGNÓ (Send Manual → Assign) el viaje a este driver.`
				);
			}
			mark('request recibido → aceptar');
			const travelId = await this.captureTravelId();
			await this.dismissStaleModals();
			await this.acceptTripRobust();
			mark(`aceptado (travelId=${travelId}) → TravelToStartPage`);

			// 2. "Empezar Viaje" (selector real) → modal "¿Desea empezar el Viaje?" → "Si" (geocerca in-range).
			await this.jsTapActive(
				['app-page-travel-to-start ion-footer ion-toolbar button', 'button.btn.primary.trip-pax-start'],
				'Empezar Viaje'
			);
			await this.getDriverPause(1_500);
			await this.jsTapConfirmSi();
			const inProgress = await this.waitForWebUrl('TravelInProgressPage', DEFAULTS.inProgressTimeoutMs);
			if (!inProgress)
				throw new Error(
					`No se alcanzó TravelInProgressPage tras "Empezar Viaje" (travelId=${travelId ?? '?'}).`
				);
			mark('en-progreso → Finalizar Viaje');

			// 3. "Finalizar Viaje" (selector real) → "¿Finalizar Viaje?" → "Si".
			await this.jsTapActive(
				[
					'app-page-travel-in-progress .btn-finish-container button',
					'app-page-travel-in-progress button.btn.finish'
				],
				'Finalizar Viaje'
			);
			await this.getDriverPause(1_500);
			await this.jsTapConfirmSi();
			const resume = await this.waitForWebUrl('TravelResumePage', DEFAULTS.resumeTimeoutMs);
			if (!resume) throw new Error('No se alcanzó TravelResumePage tras "Finalizar Viaje".');
			mark('resume → asegurar CREDIT_CARD + "Ingresar tarjeta"');

			// 4. Resumen: asegurar método CREDIT_CARD (footer "Ingresar tarjeta") y tap.
			//    Nota: en viaje FRESCO (conducido) calculateCost habilita el botón.
			await this.selectCreditCardMethod().catch(() => false);
			await this.jsTapActive(
				['app-travel-resume ion-footer ion-toolbar button', 'app-travel-resume ion-footer button.btn.finish'],
				'Ingresar tarjeta'
			);
			mark('Ingresar tarjeta → esperando modal de cobro Stripe');

			// 5. Modal de cobro Stripe Elements → fill → COBRAR.
			const modalReady = await this.getPayment().waitForPaymentScreen(DEFAULTS.paymentModalTimeoutMs);
			if (!modalReady) {
				throw new Error(
					`No apareció el modal de cobro (credit-card-payment-data / Stripe Elements) tras "Ingresar tarjeta" (travelId=${travelId ?? '?'}).`
				);
			}
			reachedPaymentModal = true;
			mark('modal Stripe presente → fill iframe + COBRAR');
			await this.getPayment().fillCardForm(card);
			await this.getPayment().submitPayment();
			mark('COBRAR enviado → state-machine post-cobro');

			// 6. STATE MACHINE post-COBRAR (orden NO determinista): reacciona a lo presente en bucle
			//    hasta estado terminal — challenge 3DS (completar), firma del pasajero (dibujar+Guardar),
			//    éxito (home/viaje cerrado), o alert de error/cancelación. El 3DS puede aparecer antes
			//    o después de la firma.
			const outcome = await this.resolvePostCharge(mark, expect3ds);
			mark(`outcome=${outcome.status}`);

			return { outcome, totalAmount: '', reachedPaymentModal };
		} catch (error) {
			const dumpPath = await dumpAppiumState(this.home.getDriver(), 'driver-cargo-decline-failure').catch(
				() => null
			);
			const suffix = dumpPath ? ` Appium dump: ${dumpPath}` : '';
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`[DriverCargoDeclineHarness] ${message}.${suffix}`);
		}
	}

	/** Standalone (sin pre-warm externo): prewarm + reactAndCharge. */
	async runDeclinePhase(card: CardData, options: DriverCargoDeclineOptions = {}): Promise<DriverCargoDeclineResult> {
		await this.prewarm(options);
		return this.reactAndCharge(card, options);
	}

	// --- Cargo a Bordo · interacción de travel-resume (source-derived) ---------

	/**
	 * Selecciona CREDIT_CARD (Cargo a Bordo) en el resumen usando la SEÑAL DEL FOOTER, no el
	 * icon src (que viene vacío). El footer del resumen es "Ingresar tarjeta" ⟺ CREDIT_CARD
	 * seleccionado (getLabelButton). Para Cargo a Bordo suele ser el default; si no, se clickean
	 * los `.travel-payment button.payment` hasta que el footer quede en "Ingresar tarjeta".
	 *
	 * IMPORTANTE: se usa JS .click() vía execute() scopeado a la página ACTIVA
	 * (app-travel-resume:not(.ion-page-hidden)) — el click coordinado de WebdriverIO es
	 * interceptado por el <ion-content> de la página activa (hay ion-pages ocultas en el DOM).
	 */
	private async selectCreditCardMethod(): Promise<boolean> {
		const driver = this.home.getDriver();

		const readFooter = async (): Promise<string> =>
			driver
				.execute<string, []>(() => {
					const norm = (v: unknown) =>
						String(v ?? '')
							.replace(/\s+/g, ' ')
							.trim();
					const resume =
						document.querySelector('app-travel-resume:not(.ion-page-hidden)') ??
						document.querySelector('app-travel-resume');
					const b = resume?.querySelector('ion-footer button.btn.finish') as HTMLElement | null;
					return norm(b?.innerText);
				})
				.catch(() => '');

		// La lista/costo se llenan async (ionViewDidEnter → fillPaymentMethodCombo + calculateCost).
		const deadline = Date.now() + 18_000;
		let payIdx = 0;
		while (Date.now() < deadline) {
			await this.switchToWebView();

			// ¿Ya está CREDIT_CARD seleccionado? (footer "Ingresar tarjeta").
			if (/ingresar tarjeta/i.test(await readFooter())) return true;

			// Si no, click (JS, página activa) al siguiente payment button y reevaluar.
			await driver
				.execute<boolean, [number]>(idx => {
					const resume =
						document.querySelector('app-travel-resume:not(.ion-page-hidden)') ??
						document.querySelector('app-travel-resume');
					if (!resume) return false;
					const pays = Array.from(resume.querySelectorAll('.travel-payment button.payment')).filter(
						b => (b as HTMLElement).offsetParent !== null
					) as HTMLElement[];
					if (!pays.length) return false;
					pays[idx % pays.length].click();
					return true;
				}, payIdx)
				.catch(() => false);
			payIdx++;
			await driver.pause(2_000); // changePaymentMethod → calculateCost
			if (/ingresar tarjeta/i.test(await readFooter())) return true;
			await driver.pause(800);
		}
		return false;
	}

	/**
	 * Acepta el request de viaje (TravelConfirmPage) con JS .click() scopeado a la página ACTIVA.
	 * El coordinate-click de WebdriverIO (screen verificado) se intercepta por el ion-content de
	 * la página activa cuando hay ion-pages ocultas. Espera transición fuera de TravelConfirmPage.
	 */
	private async acceptTripRobust(): Promise<void> {
		const driver = this.home.getDriver();
		const deadline = Date.now() + 25_000;
		let usedFallback = false;
		while (Date.now() < deadline) {
			await this.switchToWebView();
			const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
			if (!/TravelConfirmPage/i.test(url)) return; // ya transicionó (aceptado)

			const clicked = await driver
				.execute<boolean, []>(() => {
					const norm = (v: unknown) =>
						String(v ?? '')
							.replace(/\s+/g, ' ')
							.trim()
							.toLowerCase();
					const page =
						document.querySelector('app-page-travel-confirm:not(.ion-page-hidden)') ??
						document.querySelector('app-page-travel-confirm');
					const scope: ParentNode = page ?? document;
					const btns = Array.from(
						scope.querySelectorAll('ion-footer button, button.btn.primary, button')
					) as HTMLElement[];
					const b = btns.find(
						x => x.offsetParent !== null && /aceptar|buscar pasajero/.test(norm(x.innerText))
					);
					if (b) {
						b.click();
						return true;
					}
					return false;
				})
				.catch(() => false);

			// Fallback una vez al screen verificado (por si el DOM difiere).
			if (!clicked && !usedFallback) {
				usedFallback = true;
				await this.getRequest()
					.acceptTrip()
					.catch(() => undefined);
			}
			await driver.pause(2_000);
		}
	}

	/** Diagnóstico del estado de pago del resumen (para errores claros). */
	private async describeResumePayment(): Promise<string> {
		const driver = this.home.getDriver();
		await this.switchToWebView().catch(() => undefined);
		const info = await driver
			.execute<Record<string, unknown>, []>(() => {
				const norm = (v: unknown) =>
					String(v ?? '')
						.replace(/\s+/g, ' ')
						.trim();
				const payBtns = Array.from(
					document.querySelectorAll('.travel-payment button.payment, button.payment')
				).map(b => ({
					iconSrc: b.querySelector('ion-icon')?.getAttribute('src') ?? '',
					text: norm((b as HTMLElement).innerText)
				}));
				const footer = Array.from(document.querySelectorAll('ion-footer button, button.btn.finish')).map(b =>
					norm((b as HTMLElement).innerText)
				);
				return { url: window.location.href, payButtonsCount: payBtns.length, payBtns, footer };
			})
			.catch(e => ({ error: String(e) }));
		return JSON.stringify(info);
	}

	/**
	 * Tap en el botón de cierre del resumen, cuyo texto pasa a "Ingresar tarjeta"
	 * al elegir CREDIT_CARD. Abre el modal CreditCardPaymentDataComponent.
	 */
	private async tapEnterCardButton(): Promise<void> {
		const driver = this.home.getDriver();

		// Esperar a que el footer "Ingresar tarjeta" esté HABILITADO (en viaje fresco,
		// calculateCost setea totalCostFinal → botón enabled; disabled ⟺ totalCostFinal 0/falsy).
		const deadline = Date.now() + 12_000;
		while (Date.now() < deadline) {
			await this.switchToWebView();
			const state = await driver
				.execute<{ found: boolean; disabled: boolean; text: string }, []>(() => {
					const norm = (v: unknown) =>
						String(v ?? '')
							.replace(/\s+/g, ' ')
							.trim();
					const resume =
						document.querySelector('app-travel-resume:not(.ion-page-hidden)') ??
						document.querySelector('app-travel-resume');
					const b = resume?.querySelector('ion-footer button.btn.finish') as HTMLButtonElement | null;
					if (!b) return { found: false, disabled: true, text: '' };
					return {
						found: true,
						disabled: b.disabled || b.getAttribute('disabled') !== null,
						text: norm(b.innerText)
					};
				})
				.catch(() => ({ found: false, disabled: true, text: '' }));

			if (state.found && !state.disabled) {
				// JS .click() en la página activa (evita interceptación por ion-content).
				await driver
					.execute<boolean, []>(() => {
						const resume =
							document.querySelector('app-travel-resume:not(.ion-page-hidden)') ??
							document.querySelector('app-travel-resume');
						const b = resume?.querySelector('ion-footer button.btn.finish') as HTMLElement | null;
						if (b) {
							b.click();
							return true;
						}
						return false;
					})
					.catch(() => false);
				await driver.pause(2_500); // closeTravel → payTravelCreditCard → abre modal
				return;
			}
			await driver.pause(800);
		}
		throw new Error(
			'[DriverCargoDeclineHarness] Botón de cierre del resumen ("Ingresar tarjeta") no encontrado o quedó deshabilitado ' +
				'(totalCostFinal=0). Verificar que el viaje calculó costo al finalizar.'
		);
	}

	/**
	 * Captura el travelId numérico desde la URL de TravelConfirmPage (viene URL-encoded:
	 * .../TravelConfirmPage;data=%7B...%22travelId%22:62105...). Decodifica y matchea.
	 */
	private async captureTravelId(): Promise<string | null> {
		const driver = this.home.getDriver();
		await this.switchToWebView();
		const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
		let decoded = url;
		try {
			decoded = decodeURIComponent(url);
		} catch {
			/* keep raw */
		}
		const match = decoded.match(/travelId["']?\s*:\s*(\d+)/i);
		return match ? match[1] : null;
	}

	/**
	 * Inicia el viaje manejando el gate de geocerca (source: travel-to-start.ts startTravel →
	 * canPickUp()). Flujo:
	 *   1. Tap "Empezar Viaje" (footer button.btn.primary.trip-pax-start).
	 *   2. ConfirmModalComponent: confirmar. En rango → botón "Si"; fuera de rango → "Ingresar código".
	 *      Ambos son el botón primario (dismiss(true)) → clickeamos el primario.
	 *   3. Si aparece CodeConfirmationModalComponent (fuera de rango): ingresar el código
	 *      (= últimos 4 dígitos del travelId) en ion-input.code-input y tap "Confirmar".
	 */
	private async startTripHandlingGeofence(travelId: string | null): Promise<void> {
		const driver = this.home.getDriver();
		const nav = this.getNavigation();

		// 1. Reusar la lógica VERIFICADA: espera TravelToStartPage + tap "Empezar Viaje" +
		//    intenta confirmar "Si" (caso en-rango). Esto abre el ConfirmModal de geocerca.
		await nav.startTrip();
		await driver.pause(1_800);
		await this.switchToWebView();

		// 2. ¿Ya avanzó a en-progreso? (caso EN-RANGO: nav.startTrip ya confirmó "Si").
		const alreadyInProgress = await nav.waitForTravelInProgressPage(4_000).catch(() => false);
		if (alreadyInProgress) return;

		// 3. Caso FUERA DE RANGO: el ConfirmModal de geocerca sigue abierto con "Ingresar código".
		const geocerca = await driver
			.execute<boolean, []>(() => {
				const btns = Array.from(
					document.querySelectorAll('app-confirm-modal button, ion-modal button')
				) as HTMLElement[];
				return btns.some(b => /ingresar c[oó]digo/i.test(b.textContent ?? ''));
			})
			.catch(() => false);

		if (geocerca) {
			await this.clickModalButton(
				['app-confirm-modal', 'ion-modal'],
				['Ingresar código', 'Ingresar codigo'],
				'button.btn.primary'
			);
			await driver.pause(1_800);
		}

		// 4. Modal de código de geocerca (CodeConfirmationModalComponent).
		const needsCode = await driver
			.execute<
				boolean,
				[]
			>(() => !!document.querySelector('app-code-confirmation-modal, ion-input.code-input, .code-input'))
			.catch(() => false);

		if (needsCode) {
			const code = (travelId ?? '').replace(/\D/g, '').slice(-4);
			if (code.length < 4) {
				throw new Error(
					`[startTripHandlingGeofence] Geocerca pide código (últimos 4 del travelId) pero no se capturó travelId (got "${travelId}").`
				);
			}
			console.log(
				`[DriverCargoDeclineHarness] Geocerca fuera de rango → ingresando código ${code} (last4 travelId ${travelId}).`
			);

			// Llenar ion-input.code-input (Ionic 6 shadow DOM).
			await driver.execute((value: string) => {
				const host = document.querySelector('ion-input.code-input, .code-input') as
					| (HTMLElement & { value?: unknown })
					| null;
				if (!host) return;
				const root = (host as unknown as { shadowRoot?: ShadowRoot }).shadowRoot;
				const inner = (
					root ? root.querySelector('input') : host.querySelector('input')
				) as HTMLInputElement | null;
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
				if (inner && setter) {
					inner.focus();
					setter.call(inner, value);
					inner.dispatchEvent(new Event('input', { bubbles: true }));
					inner.dispatchEvent(new Event('change', { bubbles: true }));
				}
				try {
					host.value = value;
				} catch {
					/* noop */
				}
				host.dispatchEvent(new CustomEvent('ionInput', { detail: { value }, bubbles: true }));
				host.dispatchEvent(new CustomEvent('ionChange', { detail: { value }, bubbles: true }));
			}, code);
			await driver.pause(900);

			// Tap "Confirmar" (checkCode → dismiss(true) → continueTrip).
			const codeConfirmed = await this.clickModalButton(
				['app-code-confirmation-modal', 'ion-modal'],
				['Confirmar'],
				'button.btn.primary'
			);
			if (!codeConfirmed) {
				throw new Error(
					'[startTripHandlingGeofence] No se pudo confirmar el código de geocerca ("Confirmar").'
				);
			}
			await driver.pause(2_000);
		}
	}

	/** Click real del botón (btnSel) visible con alguno de los textos dados, dentro de algún containerSel. */
	private async clickModalButton(containerSelectors: string[], texts: string[], btnSel: string): Promise<boolean> {
		const driver = this.home.getDriver();
		const lc = texts.map(t => t.toLowerCase());
		for (const container of containerSelectors) {
			const btns = await driver.$$(`${container} ${btnSel}`);
			for (const btn of btns) {
				if (!(await btn.isDisplayed().catch(() => false))) continue;
				const t = (await btn.getText().catch(() => '')).trim().toLowerCase();
				if (lc.some(x => t === x || t.includes(x))) {
					await btn.click().catch(() => undefined);
					return true;
				}
			}
		}
		// Fallback: cualquier btnSel visible con el texto (sin scoping al container).
		const anyBtns = await driver.$$(btnSel);
		for (const btn of anyBtns) {
			if (!(await btn.isDisplayed().catch(() => false))) continue;
			const t = (await btn.getText().catch(() => '')).trim().toLowerCase();
			if (lc.some(x => t === x || t.includes(x))) {
				await btn.click().catch(() => undefined);
				return true;
			}
		}
		return false;
	}

	/**
	 * Cierra modales stale (code-confirmation "Volver", confirm "No"/"Cerrar", attention
	 * "Salir"/"Aceptar") que puedan haber quedado abiertos de una corrida previa y que
	 * interceptarían clicks posteriores. NUNCA toca el "Aceptar" del request de viaje
	 * (ese vive en la página TravelConfirmPage, no en un .modal-content).
	 */
	private async dismissStaleModals(maxRounds = 4): Promise<void> {
		const driver = this.home.getDriver();
		await this.switchToWebView();
		// "Aceptar"/"Captar" cierran el app-alert-modal de "Viaje perdido/Cancelado".
		const closeTexts = ['Volver', 'Cerrar', 'No', 'Salir', 'Cancelar', 'Aceptar', 'Captar'];
		for (let i = 0; i < maxRounds; i++) {
			const closed = await driver
				.execute<boolean, [string[]]>(texts => {
					const isVisible = (el: HTMLElement) => el.offsetParent !== null;
					// Solo dentro de modales para no tocar la página TravelConfirmPage.
					const scopes = Array.from(
						document.querySelectorAll(
							'ion-modal.show-modal, ion-modal, app-confirm-modal, app-code-confirmation-modal, app-alert-modal, .alert-modal-atention'
						)
					);
					for (const scope of scopes) {
						const btns = Array.from(
							scope.querySelectorAll('button, [role="button"], .alert-button')
						) as HTMLElement[];
						for (const t of texts) {
							const btn = btns.find(b => isVisible(b) && (b.textContent ?? '').trim() === t);
							if (btn) {
								btn.click();
								return true;
							}
						}
					}
					return false;
				}, closeTexts)
				.catch(() => false);
			if (!closed) break;
			await driver.pause(800);
		}
	}

	private async switchToWebView(): Promise<void> {
		const driver = this.home.getDriver();
		const contexts = (await driver.getContexts().catch(() => [])) as string[];
		const webview = contexts.find(c => c.startsWith('WEBVIEW'));
		if (webview) await driver.switchContext(webview);
	}

	private async getDriverPause(ms: number): Promise<void> {
		await this.home.getDriver().pause(ms);
	}

	/**
	 * STATE MACHINE post-COBRAR. Polea (hasta timeout) y despacha por la pantalla PRESENTE, en
	 * bucle, hasta estado terminal. El orden es NO determinista (3DS→firma, firma→3DS, o cierre
	 * directo) — reacciona a lo que haya, no asume secuencia.
	 */
	private async resolvePostCharge(
		mark: (m: string) => void,
		expect3ds: boolean,
		timeout = 120_000
	): Promise<PaymentOutcome> {
		const driver = this.home.getDriver();
		const deadline = Date.now() + timeout;
		let signed = false;
		let did3ds = false;
		while (Date.now() < deadline) {
			await this.switchToWebView();

			// (a) Éxito: volvió al home / viaje cerrado.
			const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
			if (/\/navigator\/home/i.test(url) || /FROM_TRAVEL_CLOSED/i.test(url)) {
				mark(`éxito: ${url} (3ds=${did3ds}, firma=${signed})`);
				return { status: 'success', message: `home/closed (3ds=${did3ds}, firma=${signed})` };
			}

			// (b) Challenge 3DS presente → COMPLETE.
			if (await this.getPayment().tryComplete3DS('complete')) {
				did3ds = true;
				mark('3DS COMPLETE clickeado');
				await driver.pause(3_000);
				continue;
			}

			// (c) Firma del pasajero → dibujar + Guardar (el 3DS puede aparecer DESPUÉS).
			if (await this.trySignIfPresent()) {
				signed = true;
				mark('firma dibujada + Guardar');
				await driver.pause(3_000);
				continue;
			}

			// (d) Alert bloqueante (error/cancelación).
			const alertText = await this.detectBlockingAlert();
			if (alertText) {
				mark(`alert: ${alertText.slice(0, 100)}`);
				await this.getPayment()
					.dismissAttentionModal()
					.catch(() => false);
				if (/cancelad|rechaz|no autoriz|declin|error|fALL|falló|fallo/i.test(alertText)) {
					return { status: 'declined', reason: alertText.slice(0, 200) };
				}
				if (/perdid|expir|no est[áa] disponible|ya no.*disponible/i.test(alertText)) {
					return { status: 'trip-lost', reason: alertText.slice(0, 200) };
				}
				// alert informativo no terminal → seguir.
				await driver.pause(1_000);
				continue;
			}

			await driver.pause(1_500);
		}
		return {
			status: 'unknown',
			raw: `state-machine timeout (3ds=${did3ds}, firma=${signed}, expect3ds=${expect3ds})`
		};
	}

	/**
	 * Si la pantalla de firma (app-page-signer) está presente, dibuja una firma freehand en el
	 * canvas (W3C pointer actions) y toca Guardar. Devuelve true si actuó.
	 * Selectores: canvas `app-page-signer ion-content div canvas`; Guardar
	 * `app-page-signer ion-footer ion-row button.btn.primary`.
	 */
	private async trySignIfPresent(): Promise<boolean> {
		const driver = this.home.getDriver();
		await this.switchToWebView();
		type SignerInfo = { present: boolean; rect?: { x: number; y: number; w: number; h: number } };
		const info: SignerInfo = await driver
			.execute<SignerInfo, []>(() => {
				const signer = document.querySelector('app-page-signer');
				if (!signer) return { present: false } as SignerInfo;
				const canvas = signer.querySelector('ion-content div canvas, canvas') as HTMLCanvasElement | null;
				if (!canvas) return { present: true } as SignerInfo;
				const r = canvas.getBoundingClientRect();
				return { present: true, rect: { x: r.left, y: r.top, w: r.width, h: r.height } } as SignerInfo;
			})
			.catch((): SignerInfo => ({ present: false }));

		if (!info.present) return false;
		if (!info.rect || info.rect.w < 5) {
			await driver.pause(1_000);
			return true;
		}

		const { x, y, w, h } = info.rect;
		const px = (fx: number) => Math.round(x + w * fx);
		const py = (fy: number) => Math.round(y + h * fy);
		const stroke = [
			[0.2, 0.5],
			[0.35, 0.3],
			[0.5, 0.7],
			[0.65, 0.35],
			[0.8, 0.6]
		] as const;
		try {
			await driver.performActions([
				{
					type: 'pointer',
					id: 'finger1',
					parameters: { pointerType: 'touch' },
					actions: [
						{ type: 'pointerMove', duration: 0, x: px(stroke[0][0]), y: py(stroke[0][1]) },
						{ type: 'pointerDown', button: 0 },
						...stroke
							.slice(1)
							.map(([fx, fy]) => ({ type: 'pointerMove' as const, duration: 120, x: px(fx), y: py(fy) })),
						{ type: 'pointerUp', button: 0 }
					]
				}
			]);
			await (driver as unknown as { releaseActions?: () => Promise<void> })
				.releaseActions?.()
				.catch(() => undefined);
		} catch (e) {
			console.warn('[DriverCargoDeclineHarness] firma performActions error:', e instanceof Error ? e.message : e);
		}
		await driver.pause(700);

		// Guardar.
		await driver
			.execute<boolean, []>(() => {
				const btn = document.querySelector(
					'app-page-signer ion-footer ion-row button.btn.primary, app-page-signer ion-footer button.btn.primary'
				) as HTMLElement | null;
				if (btn && (btn as HTMLButtonElement).offsetParent !== null) {
					btn.click();
					return true;
				}
				return false;
			})
			.catch(() => false);
		return true;
	}

	private async detectBlockingAlert(): Promise<string> {
		const driver = this.home.getDriver();
		await this.switchToWebView();
		return driver
			.execute<string, []>(() => {
				const norm = (v: unknown) =>
					String(v ?? '')
						.replace(/\s+/g, ' ')
						.trim();
				const a = document.querySelector('app-alert-modal') as HTMLElement | null;
				const m = document.querySelector('ion-modal.alert-modal-atention.show-modal') as HTMLElement | null;
				const el = a && a.offsetParent !== null ? a : m && m.offsetParent !== null ? m : null;
				return el ? norm(el.innerText ?? el.textContent) : '';
			})
			.catch(() => '');
	}

	/**
	 * JS .click() del primer botón visible que matchee alguno de los selectores, priorizando la
	 * página/contenedor ACTIVO (:not(.ion-page-hidden)). Evita la interceptación por ion-content
	 * del coordinate-click de WebdriverIO. Reintenta unos segundos (la vista puede tardar en montar).
	 */
	private async jsTapActive(selectors: string[], label: string, timeout = 15_000): Promise<void> {
		const driver = this.home.getDriver();
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			await this.switchToWebView();
			const clicked = await driver
				.execute<boolean, [string[]]>(sels => {
					const vis = (el: Element) => (el as HTMLElement).offsetParent !== null;
					for (const sel of sels) {
						// Preferir dentro de una página/host activo (no oculto).
						const scoped = sel.replace(/^(app-[a-z-]+)/i, '$1:not(.ion-page-hidden)');
						const el = (document.querySelector(scoped) ||
							document.querySelector(sel)) as HTMLElement | null;
						if (el && vis(el) && !(el as HTMLButtonElement).disabled) {
							el.click();
							return true;
						}
					}
					return false;
				}, selectors)
				.catch(() => false);
			if (clicked) return;
			await driver.pause(700);
		}
		throw new Error(
			`[jsTapActive] No se pudo clickear "${label}" (selectores: ${selectors.join(' | ')}) en ${timeout}ms.`
		);
	}

	/** JS .click() del botón primario "Si" del app-confirm-modal (¿empezar/finalizar viaje?). */
	private async jsTapConfirmSi(timeout = 10_000): Promise<boolean> {
		const driver = this.home.getDriver();
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			await this.switchToWebView();
			const clicked = await driver
				.execute<boolean, []>(() => {
					const vis = (el: Element) => (el as HTMLElement).offsetParent !== null;
					const btns = Array.from(
						document.querySelectorAll(
							'app-confirm-modal button.btn.primary, ion-modal app-confirm-modal button.btn.primary'
						)
					) as HTMLElement[];
					const si = btns.find(b => vis(b) && /^s[ií]$/i.test((b.textContent ?? '').trim()));
					const target = si ?? btns.find(b => vis(b));
					if (target) {
						target.click();
						return true;
					}
					return false;
				})
				.catch(() => false);
			if (clicked) {
				await driver.pause(1_500);
				return true;
			}
			await driver.pause(500);
		}
		return false;
	}

	private async waitForWebUrl(token: string, timeout = 60_000): Promise<boolean> {
		const driver = this.home.getDriver();
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			await this.switchToWebView();
			const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
			if (url.includes(token)) return true;
			await driver.pause(500);
		}
		return false;
	}

	// --- plumbing --------------------------------------------------------------

	private hasSession(): boolean {
		try {
			this.home.getDriver();
			return true;
		} catch {
			return false;
		}
	}

	private bind(driver: AppiumDriver): void {
		this.request = new DriverTripRequestScreen(this.config, driver);
		this.navigation = new DriverTripNavigationScreen(this.config, driver);
		this.summary = new DriverTripSummaryScreen(this.config, driver);
		this.payment = new DriverTripPaymentScreen(this.config, driver);
	}

	private getRequest(): DriverTripRequestScreen {
		if (!this.request) this.bind(this.home.getDriver());
		return this.request!;
	}

	private getNavigation(): DriverTripNavigationScreen {
		if (!this.navigation) this.bind(this.home.getDriver());
		return this.navigation!;
	}

	private getSummary(): DriverTripSummaryScreen {
		if (!this.summary) this.bind(this.home.getDriver());
		return this.summary!;
	}

	private getPayment(): DriverTripPaymentScreen {
		if (!this.payment) this.bind(this.home.getDriver());
		return this.payment!;
	}
}

/**
 * Entry point para la fase driver desde un spec Playwright (mismo patrón que
 * HybridCarrierDriverHappyPathHarness). Abre sesión Appium, ejecuta la fase
 * decline y cierra la sesión.
 */
export async function runDriverCargoDeclinePhase(
	config: MobileActorConfig,
	card: CardData,
	options: DriverCargoDeclineOptions = {}
): Promise<DriverCargoDeclineResult> {
	const harness = new DriverCargoDeclineHarness(config);
	try {
		return await harness.runDeclinePhase(card, options);
	} finally {
		await harness.endSession().catch(() => undefined);
	}
}
