/**
 * driverStaleTripRecovery
 * =======================
 * ÚNICA implementación de "conductor varado en un viaje stale → /navigator/home".
 *
 * Antes esta lógica estaba DUPLICADA (script `scripts/driver-free-stale-trip.ts` +
 * `DriverCargoDeclineHarness.freeStaleTrip()`) y ambas copias sólo manejaban
 * `TravelResumePage`: si el conductor quedaba varado en `TravelConfirmPage` /
 * `TravelToStartPage` / `TravelInProgressPage` la recuperación hacía early-return sin
 * tocar nada y el PRE-WARM de la corrida siguiente abortaba con
 * "No se pudo liberar al driver del viaje stale". Observado en vivo 2026-07-29: una fase
 * web fallida dejó el viaje 67758 cancelado server-side mientras la app del conductor
 * seguía en `TravelConfirmPage` → bloqueó TS-AUTHORIZE-TC1097 en el pre-warm.
 *
 * Es una STATE MACHINE (no una secuencia): las rutas de viaje encadenan
 * (in-progress → resume → firma → home) y encima pueden aparecer overlays
 * (alerta "viaje no disponible", modal de cancelación, modal de firma). Cada vuelta lee la
 * ruta/overlay PRESENTE y aplica la acción correcta; el ÉXITO SIEMPRE se verifica por
 * polling de la URL hasta `/navigator/home` (nunca por ausencia de un elemento).
 *
 * Acción por ruta (mecanismo derivado del código fuente magiis-mobile-driver-v2@develop,
 * salvo donde se indica MEDIDO en device):
 *
 *   TravelConfirmPage  (`travel-confirm.html` + `.ts`)
 *     El `ion-icon[name="close"]` NO navega: el handler Angular vive en el SPAN padre
 *     `.actions .cancel .action-icon` → `cancelTravel()`, que sólo ABRE el modal
 *     `TravelCancelModal` (`app-travel-cancel`). Recién al elegir un motivo el
 *     `onDidDismiss` dispara `cancel()` → `travelService.refuseTravel()` →
 *     `router.navigate(['navigator/home', { mustReset: true }])`. Por eso el intento MEDIDO
 *     de clickear el icono no cambiaba la URL: dejaba el modal abierto sin contestar.
 *     `componentProps: { incomingTrip: true }` oculta "No encontré al pasajero"
 *     (`*ngIf="!isIncomingTrip"`) → el único motivo disponible es el primer
 *     `button.btn-black` (CANNOT_COVER). El footer `button.btn-outlined-primary`
 *     ("Cerrar") hace `dismiss(null)` = NO-OP → nunca clickearlo.
 *     Nota: `refuseTravel` navega a home tanto en `.then` como en `.catch`, así que un
 *     viaje ya cancelado server-side (el caso vivo) igual libera al conductor.
 *
 *   TravelToStartPage  (`travel-to-start.html` + `.ts`)
 *     Mismo mecanismo (`.actions .cancel .action-icon` → `openCancelTravelModal()`), pero
 *     con `incomingTrip: false`: aparece también "No encontré al pasajero", que pasa por
 *     `statusService.canPickUp()` (geocerca) y con el device fuera de rango hace
 *     `dismiss(null)` = NO-OP. Se elige SIEMPRE el primer `button.btn-black`
 *     (CANNOT_COVER), que no tiene gate de geocerca.
 *
 *   TravelInProgressPage  (`travel-in-progress.html`)
 *     NO tiene acción de cancelar (confirmado: el único `.cancel .action-container` del
 *     repo está en travel-confirm y travel-to-start). La salida es FINALIZAR:
 *     `.btn-finish-container button` → `finishTravelDialog()` → `app-confirm-modal` "Si"
 *     → cae en TravelResumePage, que esta misma máquina resuelve en la vuelta siguiente.
 *     El botón cambia de clase (`btn finish` ↔ `btn-outlined-red` con `timerOn`) pero
 *     conserva el handler → se targetea por contenedor, no por clase.
 *
 *   TravelResumePage  (lógica MEDIDA, portada tal cual de las dos copias previas)
 *     Cicla `.travel-payment button.payment` hasta que el footer
 *     `ion-footer button.btn.finish` quede HABILITADO y su texto NO sea "Ingresar tarjeta"
 *     (CREDIT_CARD queda disabled si `totalCostFinal=0`, típico de un viaje stale) y
 *     entonces cierra. Si el cierre exige firma (`mustToSign` → modal `SignerPage`), la
 *     rama de firma de abajo la resuelve.
 *
 *   app-page-signer  (selectores MEDIDOS en device — ver docs/mobile/driver-app-appium-flow-map.md §6)
 *     Dibuja un trazo freehand en el canvas (W3C pointer actions) y toca Guardar.
 *
 *   app-alert-modal / ion-modal.alert-modal-atention  (MEDIDO: "Aceptar" = `button.btn-outlined-red`)
 *     Overlay bloqueante ("El viaje ya no está disponible") que intercepta todo → se
 *     acepta primero. Se acota a los hosts de ALERTA para no contestar por accidente el
 *     modal de cancelación ni el confirm de finalizar.
 *
 *   /pre-home  (MEDIDO — flow-map §1.2)
 *     Overlay de bienvenida tras un relanzamiento: tap `button.btn.primary` "Aceptar".
 *
 * ÚLTIMO RECURSO (force-stop + relaunch): queda DETRÁS de todos los intentos in-app y con
 * log explícito de que se llegó a ese extremo. Es lo único que destrabó el caso vivo
 * (`adb shell am force-stop com.magiis.app.test.driver` + relanzar) porque el relanzamiento
 * fuerza la restauración de estado (`getAppStatus`). Acá se ejecuta DENTRO de la sesión
 * Appium (`terminateApp` + `activateApp` = el mismo `am force-stop` + `am start` que hace
 * adb) para no depender de un binario externo ni perder la sesión.
 */

import type { AppiumDriver } from '../base/AppiumSessionBase';

/** Rutas que dejan al conductor OCUPADO: no recibe offers nuevos. */
export const DRIVER_BUSY_ROUTE_PATTERN = /Travel(InProgress|ToStart|Resume|Confirm)Page/i;

/** Única ruta que cuenta como conductor LIBRE. */
export const DRIVER_HOME_ROUTE_PATTERN = /\/navigator\/home/i;

export type StaleTripRecoveryOptions = {
	/** Package de la app driver. Necesario SÓLO para el último recurso (force-stop + relaunch). */
	appPackage?: string | null;
	/** Presupuesto de los intentos IN-APP (no incluye el reinicio). */
	inAppTimeoutMs?: number;
	/** Habilita el último recurso force-stop + relaunch. Default true. */
	allowAppRestart?: boolean;
	/** Presupuesto para llegar a home DESPUÉS del reinicio. */
	restartTimeoutMs?: number;
	/** Sink de logs (el harness prefija con su nombre; el script con `[free]`). */
	log?: (message: string) => void;
};

export type StaleTripRecoveryResult = {
	/** true ⟺ se verificó `/navigator/home` por polling de URL. */
	freed: boolean;
	startUrl: string;
	finalUrl: string;
	usedAppRestart: boolean;
	/** Traza ordenada de lo intentado — alimenta el mensaje de error accionable. */
	actions: string[];
};

const DEFAULTS = {
	inAppTimeoutMs: 90_000,
	restartTimeoutMs: 60_000
} as const;

/** Ruta legible: recorta origin y el payload `;data={…}` que hace ilegible el log. */
export function shortRoute(url: string): string {
	if (!url) return '(sin URL)';
	const path = url.replace(/^https?:\/\/[^/]+/i, '');
	const [route] = path.split(';');
	return (route || path).trim() || path;
}

async function switchToWebView(driver: AppiumDriver): Promise<void> {
	const contexts = (await driver.getContexts().catch(() => [])) as string[];
	const webview = contexts.find(context => context.startsWith('WEBVIEW'));
	if (webview) await driver.switchContext(webview);
}

async function readUrl(driver: AppiumDriver): Promise<string> {
	return driver.execute<string, []>(() => window.location.href).catch(() => '');
}

/**
 * Acepta el overlay de alerta bloqueante (trip-lost / error). Acotado a los hosts de
 * ALERTA: contestar cualquier modal visible rompería el modal de cancelación (su
 * "Cerrar" es un no-op) o el confirm de finalizar (su "No" aborta la acción).
 */
async function dismissBlockingAlert(driver: AppiumDriver): Promise<boolean> {
	return driver
		.execute<boolean, []>(() => {
			const visible = (element: Element | null): boolean =>
				!!element && (element as HTMLElement).offsetParent !== null;
			const hosts = Array.from(
				document.querySelectorAll('app-alert-modal, ion-modal.alert-modal-atention.show-modal')
			) as HTMLElement[];
			const host = hosts.find(visible);
			if (!host) return false;
			const buttons = Array.from(host.querySelectorAll('button')) as HTMLElement[];
			const target =
				buttons.find(button => visible(button) && button.classList.contains('btn-outlined-red')) ??
				buttons.find(
					button => visible(button) && /aceptar|captar|entendido|ok/i.test(button.textContent ?? '')
				) ??
				buttons.find(visible);
			if (!target) return false;
			target.click();
			return true;
		})
		.catch(() => false);
}

/**
 * Rama TravelConfirmPage / TravelToStartPage. Idempotente: si el modal de cancelación ya
 * está abierto contesta el motivo; si no, lo abre desde el span `.action-icon`.
 * Devuelve la acción ejecutada, o null si no encontró nada clickeable.
 */
async function refuseTravelViaCancelModal(driver: AppiumDriver, pageHost: string): Promise<string | null> {
	const step = await driver
		.execute<string, [string]>(host => {
			const visible = (element: Element): boolean => (element as HTMLElement).offsetParent !== null;
			const modal = Array.from(document.querySelectorAll('app-travel-cancel')).find(visible) as
				| HTMLElement
				| undefined;

			if (modal) {
				// Primer .btn-black = CANNOT_COVER ("No puedo cubrir el viaje"): único motivo sin
				// gate de geocerca y el único visible cuando incomingTrip=true.
				const reason = (Array.from(modal.querySelectorAll('button.btn-black')) as HTMLElement[]).find(visible);
				if (!reason) return 'modal-sin-motivo';
				reason.click();
				return 'motivo';
			}

			// Sólo abrir el modal cuando NO hay ninguna instancia montada: re-tapear la X con un
			// modal ya presente (aunque esté animando) apilaría un segundo modal.
			if (document.querySelector('app-travel-cancel')) return 'modal-montandose';

			const page =
				document.querySelector(`${host}:not(.ion-page-hidden)`) ?? document.querySelector(host) ?? document;
			// El (click) de Angular vive en el SPAN, no en el ion-icon.
			const icon = Array.from(page.querySelectorAll('.actions .cancel .action-icon, .cancel .action-icon')).find(
				visible
			) as HTMLElement | undefined;
			if (!icon) return 'sin-x';
			icon.click();
			return 'abrir-modal';
		}, pageHost)
		.catch(() => 'error');

	switch (step) {
		case 'motivo':
			return 'modal de cancelacion -> motivo "no puedo cubrir" (refuseTravel -> home)';
		case 'abrir-modal':
			return 'tap X (.cancel .action-icon) -> abre modal de cancelacion';
		case 'modal-montandose':
			return 'modal de cancelacion montandose — esperando';
		case 'modal-sin-motivo':
			return 'modal de cancelacion abierto pero sin button.btn-black visible — esperando';
		default:
			return null;
	}
}

/**
 * Rama TravelInProgressPage: finalizar el viaje. Idempotente igual que la anterior — si el
 * confirm ya está abierto contesta "Si" en lugar de re-disparar el diálogo.
 */
async function finishTripInProgress(driver: AppiumDriver): Promise<string | null> {
	if (await tapConfirmModalYes(driver)) return 'confirm "Finalizar Viaje" -> Si';

	// Confirm montándose: re-tapear "Finalizar Viaje" apilaría un segundo diálogo.
	const confirmMounting = await driver
		.execute<boolean, []>(() => !!document.querySelector('app-confirm-modal'))
		.catch(() => false);
	if (confirmMounting) return 'confirm de finalizar montandose — esperando';

	const tapped = await driver
		.execute<boolean, []>(() => {
			const visible = (element: Element): boolean => (element as HTMLElement).offsetParent !== null;
			const page =
				document.querySelector('app-page-travel-in-progress:not(.ion-page-hidden)') ??
				document.querySelector('app-page-travel-in-progress') ??
				document;
			// El botón alterna clase (btn finish / btn-outlined-red con timerOn) pero conserva
			// el handler finishTravelDialog() → targetear por contenedor.
			const button = (
				Array.from(
					page.querySelectorAll('.btn-finish-container button, button.btn.finish, button.btn-outlined-red')
				) as HTMLElement[]
			).find(candidate => visible(candidate) && !(candidate as HTMLButtonElement).disabled);
			if (!button) return false;
			button.click();
			return true;
		})
		.catch(() => false);
	return tapped ? 'tap "Finalizar Viaje"' : null;
}

/** "Si" del `app-confirm-modal` (ConfirmModalComponent). El primario es el que confirma. */
async function tapConfirmModalYes(driver: AppiumDriver): Promise<boolean> {
	return driver
		.execute<boolean, []>(() => {
			const visible = (element: Element): boolean => (element as HTMLElement).offsetParent !== null;
			const host = Array.from(document.querySelectorAll('app-confirm-modal')).find(visible) as
				| HTMLElement
				| undefined;
			if (!host) return false;
			const buttons = Array.from(host.querySelectorAll('button.btn.primary, button')) as HTMLElement[];
			const yes =
				buttons.find(button => visible(button) && /^s[ií]$/i.test((button.textContent ?? '').trim())) ??
				buttons.find(button => visible(button) && button.classList.contains('primary'));
			if (!yes) return false;
			yes.click();
			return true;
		})
		.catch(() => false);
}

type ResumeFooter = { text: string; disabled: boolean; payCount: number };

async function readResumeFooter(driver: AppiumDriver): Promise<ResumeFooter> {
	return driver
		.execute<ResumeFooter, []>(() => {
			const norm = (value: unknown): string =>
				String(value ?? '')
					.replace(/\s+/g, ' ')
					.trim();
			const resume =
				document.querySelector('app-travel-resume:not(.ion-page-hidden)') ??
				document.querySelector('app-travel-resume');
			const button = resume?.querySelector('ion-footer button.btn.finish') as HTMLButtonElement | null;
			const payCount = Array.from(resume?.querySelectorAll('.travel-payment button.payment') ?? []).filter(
				candidate => (candidate as HTMLElement).offsetParent !== null
			).length;
			return {
				text: button ? norm(button.innerText) : '',
				disabled: button ? button.disabled || button.getAttribute('disabled') !== null : true,
				payCount
			};
		})
		.catch(() => ({ text: '', disabled: true, payCount: 0 }));
}

/**
 * Rama TravelResumePage (lógica MEDIDA). Cierra si el footer ya está cerrable; si no,
 * rota al siguiente método de pago. "Ingresar tarjeta" (CREDIT_CARD) se descarta: queda
 * disabled cuando `totalCostFinal=0`, que es lo normal en un viaje stale.
 */
async function stepCloseResume(driver: AppiumDriver, payIndex: number): Promise<string | null> {
	const footer = await readResumeFooter(driver);
	const closable = footer.text.length > 0 && !footer.disabled && !/ingresar tarjeta/i.test(footer.text);

	if (closable) {
		const clicked = await driver
			.execute<boolean, []>(() => {
				const resume =
					document.querySelector('app-travel-resume:not(.ion-page-hidden)') ??
					document.querySelector('app-travel-resume');
				const button = resume?.querySelector('ion-footer button.btn.finish') as HTMLElement | null;
				if (!button) return false;
				button.click();
				return true;
			})
			.catch(() => false);
		if (clicked) return `resumen -> cierre con footer "${footer.text}"`;
	}

	const rotated = await driver
		.execute<boolean, [number]>(index => {
			const resume =
				document.querySelector('app-travel-resume:not(.ion-page-hidden)') ??
				document.querySelector('app-travel-resume');
			if (!resume) return false;
			const payments = Array.from(resume.querySelectorAll('.travel-payment button.payment')).filter(
				candidate => (candidate as HTMLElement).offsetParent !== null
			) as HTMLElement[];
			if (!payments.length) return false;
			payments[index % payments.length].click();
			return true;
		}, payIndex)
		.catch(() => false);
	if (rotated) {
		return `resumen -> metodo de pago [${payIndex}] (footer "${footer.text}" disabled=${footer.disabled})`;
	}
	return null;
}

type SignerInfo = { present: boolean; rect?: { x: number; y: number; w: number; h: number } };

/**
 * Modal de firma (`SignerPage`, presentado por `finalizeTravel()` cuando `mustToSign`).
 * Selectores + mecánica de trazo MEDIDOS en device. Devuelve true si actuó.
 */
async function signIfSignerPresent(driver: AppiumDriver): Promise<boolean> {
	const info: SignerInfo = await driver
		.execute<SignerInfo, []>(() => {
			const signer = document.querySelector('app-page-signer');
			if (!signer) return { present: false } as SignerInfo;
			const canvas = signer.querySelector('ion-content div canvas, canvas') as HTMLCanvasElement | null;
			if (!canvas) return { present: true } as SignerInfo;
			const rect = canvas.getBoundingClientRect();
			return {
				present: true,
				rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
			} as SignerInfo;
		})
		.catch((): SignerInfo => ({ present: false }));

	if (!info.present) return false;
	if (!info.rect || info.rect.w < 5) {
		await driver.pause(1_000);
		return true;
	}

	const { x, y, w, h } = info.rect;
	const px = (fx: number): number => Math.round(x + w * fx);
	const py = (fy: number): number => Math.round(y + h * fy);
	const stroke = [
		[0.2, 0.5],
		[0.35, 0.3],
		[0.5, 0.7],
		[0.65, 0.35],
		[0.8, 0.6]
	] as const;
	await driver
		.performActions([
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
		])
		.catch(() => undefined);
	await driver.pause(700);

	await driver
		.execute<boolean, []>(() => {
			const button = document.querySelector(
				'app-page-signer ion-footer ion-row button.btn.primary, app-page-signer ion-footer button.btn.primary'
			) as HTMLElement | null;
			if (!button || button.offsetParent === null) return false;
			button.click();
			return true;
		})
		.catch(() => false);
	return true;
}

/** Overlay `/pre-home` tras un relanzamiento: `button.btn.primary` "Aceptar" (MEDIDO). */
async function dismissPreHomeOverlay(driver: AppiumDriver): Promise<boolean> {
	return driver
		.execute<boolean, []>(() => {
			const visible = (element: Element): boolean => (element as HTMLElement).offsetParent !== null;
			const buttons = Array.from(document.querySelectorAll('button.btn.primary')) as HTMLElement[];
			const accept =
				buttons.find(button => visible(button) && /aceptar/i.test((button.textContent ?? '').trim())) ??
				buttons.find(visible);
			if (!accept) return false;
			accept.click();
			return true;
		})
		.catch(() => false);
}

/**
 * ÚLTIMO RECURSO: force-stop + relaunch dentro de la sesión Appium. `terminateApp` /
 * `activateApp` son el `am force-stop` / `am start` que corre adb, sin binario externo.
 * Fallback a los scripts `mobile:` por si el driver no expone los atajos.
 */
async function restartDriverApp(driver: AppiumDriver, appPackage: string): Promise<void> {
	const lifecycle = driver as unknown as {
		terminateApp?: (appId: string) => Promise<unknown>;
		activateApp?: (appId: string) => Promise<unknown>;
	};
	const mobileScript = driver as unknown as {
		execute: (script: string, ...args: unknown[]) => Promise<unknown>;
	};

	if (typeof lifecycle.terminateApp === 'function') {
		await lifecycle.terminateApp(appPackage);
	} else {
		await mobileScript.execute('mobile: terminateApp', { appId: appPackage });
	}
	await driver.pause(2_000);
	if (typeof lifecycle.activateApp === 'function') {
		await lifecycle.activateApp(appPackage);
	} else {
		await mobileScript.execute('mobile: activateApp', { appId: appPackage });
	}
	await driver.pause(4_000);
}

/**
 * Lleva al conductor de vuelta a `/navigator/home`, sea cual sea la ruta/overlay en que
 * quedó varado. Éxito = URL `/navigator/home` verificada por polling.
 */
export async function recoverDriverToHome(
	driver: AppiumDriver,
	options: StaleTripRecoveryOptions = {}
): Promise<StaleTripRecoveryResult> {
	const log = options.log ?? ((message: string) => console.log(`[stale-trip] ${message}`));
	const inAppTimeoutMs = options.inAppTimeoutMs ?? DEFAULTS.inAppTimeoutMs;
	const restartTimeoutMs = options.restartTimeoutMs ?? DEFAULTS.restartTimeoutMs;
	const allowAppRestart = options.allowAppRestart ?? true;
	const appPackage = options.appPackage ?? null;

	const actions: string[] = [];
	const record = (action: string): void => {
		// Colapsa repeticiones consecutivas (los pasos "esperando" se repiten por vuelta) para que
		// la traza del mensaje de error siga siendo legible.
		if (actions[actions.length - 1] !== action) actions.push(action);
		log(action);
	};

	await switchToWebView(driver);
	const startUrl = await readUrl(driver);
	if (DRIVER_HOME_ROUTE_PATTERN.test(startUrl)) {
		log(`ya en home (${shortRoute(startUrl)}) — nada que liberar.`);
		return { freed: true, startUrl, finalUrl: startUrl, usedAppRestart: false, actions: ['ya en home'] };
	}
	log(`ruta inicial: ${shortRoute(startUrl)}`);

	let payIndex = 0;
	let strandedAtLogin = false;
	let url = startUrl;
	const deadline = Date.now() + inAppTimeoutMs;

	while (Date.now() < deadline) {
		await switchToWebView(driver);
		url = await readUrl(driver);
		if (DRIVER_HOME_ROUTE_PATTERN.test(url)) {
			log(`liberado -> ${shortRoute(url)}`);
			return { freed: true, startUrl, finalUrl: url, usedAppRestart: false, actions };
		}

		// Overlays primero: interceptan cualquier click de la página de abajo.
		if (await dismissBlockingAlert(driver)) {
			record('alerta bloqueante -> Aceptar');
			await driver.pause(1_200);
			continue;
		}
		if (await signIfSignerPresent(driver)) {
			record('firma -> trazo + Guardar');
			await driver.pause(2_500);
			continue;
		}

		let step: string | null = null;
		if (/TravelConfirmPage/i.test(url)) {
			step = await refuseTravelViaCancelModal(driver, 'app-page-travel-confirm');
			if (step) record(`TravelConfirmPage: ${step}`);
		} else if (/TravelToStartPage/i.test(url)) {
			step = await refuseTravelViaCancelModal(driver, 'app-page-travel-to-start');
			if (step) record(`TravelToStartPage: ${step}`);
		} else if (/TravelInProgressPage/i.test(url)) {
			step = await finishTripInProgress(driver);
			if (step) record(`TravelInProgressPage: ${step}`);
		} else if (/TravelResumePage/i.test(url)) {
			step = await stepCloseResume(driver, payIndex);
			payIndex++;
			if (step) record(`TravelResumePage: ${step}`);
		} else if (/pre-home/i.test(url)) {
			step = (await dismissPreHomeOverlay(driver)) ? 'pre-home -> Aceptar' : null;
			if (step) record(step);
		} else if (/\/login/i.test(url)) {
			// Sin credenciales acá; re-loguear es responsabilidad del caller.
			strandedAtLogin = true;
			record('la app cayo a /login — la recuperacion no puede re-loguear');
			break;
		}

		// Nada accionable en esta vuelta: esperar a que monte la vista y reevaluar.
		await driver.pause(step ? 2_200 : 1_500);
	}

	url = await readUrl(driver);
	if (DRIVER_HOME_ROUTE_PATTERN.test(url)) {
		return { freed: true, startUrl, finalUrl: url, usedAppRestart: false, actions };
	}

	if (strandedAtLogin || !allowAppRestart || !appPackage) {
		const reason = strandedAtLogin
			? 'sesion en /login'
			: !allowAppRestart
				? 'reinicio deshabilitado por el caller'
				: 'sin appPackage para reiniciar';
		record(`sin liberar tras los intentos in-app (${reason})`);
		return { freed: false, startUrl, finalUrl: url, usedAppRestart: false, actions };
	}

	// ── ÚLTIMO RECURSO ────────────────────────────────────────────────────────
	record(
		`ULTIMO RECURSO: los intentos in-app NO liberaron al driver (sigue en ${shortRoute(url)}) ` +
			`-> force-stop + relaunch de ${appPackage} (equivalente in-session de ` +
			`"adb shell am force-stop ${appPackage}" + relanzar; fuerza la restauracion getAppStatus)`
	);
	await restartDriverApp(driver, appPackage).catch((error: unknown) => {
		record(`force-stop/relaunch fallo: ${error instanceof Error ? error.message : String(error)}`);
	});

	const restartDeadline = Date.now() + restartTimeoutMs;
	while (Date.now() < restartDeadline) {
		await switchToWebView(driver);
		url = await readUrl(driver);
		if (DRIVER_HOME_ROUTE_PATTERN.test(url)) {
			record(`liberado tras el reinicio -> ${shortRoute(url)}`);
			return { freed: true, startUrl, finalUrl: url, usedAppRestart: true, actions };
		}
		if (/pre-home/i.test(url) && (await dismissPreHomeOverlay(driver))) {
			record('post-reinicio: pre-home -> Aceptar');
		} else if (await dismissBlockingAlert(driver)) {
			record('post-reinicio: alerta bloqueante -> Aceptar');
		}
		await driver.pause(1_500);
	}

	record(`sin liberar incluso tras el reinicio (quedo en ${shortRoute(url)})`);
	return { freed: false, startUrl, finalUrl: url, usedAppRestart: true, actions };
}

/** Mensaje de error accionable: qué ruta quedó, qué se intentó y cómo destrabar a mano. */
export function describeStaleTripRecovery(result: StaleTripRecoveryResult, appPackage?: string | null): string {
	const trail = result.actions.length ? result.actions.join(' | ') : '(sin acciones ejecutadas)';
	const pkg = appPackage ?? 'com.magiis.app.test.driver';
	return (
		`Driver sigue OCUPADO en ${shortRoute(result.finalUrl)} (arrancó en ${shortRoute(result.startUrl)}; ` +
		`reinicio de app: ${result.usedAppRestart ? 'sí' : 'no'}). Intentos: ${trail}. ` +
		`Destrabar a mano: adb -s $ANDROID_UDID shell am force-stop ${pkg} + relanzar la app, ` +
		'o cancelar el viaje (app / API PUT travels/cancel), y reintentar.'
	);
}
