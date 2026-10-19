/**
 * Pre-flight del Driver app antes de un viaje real (Appium + emulador).
 *
 * Verifica la sesión ya iniciada del chofer; solo hace login si la app está deslogueada (formulario
 * de login visible) usando DRIVER_EMAIL_FR / DRIVER_PASSWORD_FR (nunca se imprimen).
 * Aborta —sin tocar nada más— si: (1) la app en primer plano no es la esperada, (2) las claves FR no
 * están definidas, (3) el chofer logueado no coincide con el chofer FR esperado, (4) la app ya
 * está dentro de un viaje (oferta pendiente, en curso o resumen).
 *
 * La evaluación es una función pura (`evaluateDriverPreflight`) para poder testearla sin Appium.
 * Identidad: la app no expone el email logueado, así que se compara el NOMBRE visible en el header
 * del home (mismos selectores que `scripts/dump-driver-identity.ts`) contra `DRIVER_DISPLAY_NAME_FR`.
 * Las credenciales solo se validan por presencia: nunca se imprimen.
 */

import type { AppiumDriver } from '../base/AppiumSessionBase';
import { DRIVER_CHECKPOINT_SELECTORS } from './DriverFlowSelectors';

export type DriverPreflightExpectation = {
	/** Paquete que debe estar en primer plano (ej: com.magiis.app.test.driver). */
	appPackage: string;
	/** Nombre visible esperado del chofer en el header del home (comparación sin tildes/mayúsculas). */
	driverDisplayName: string;
};

export type DriverPreflightSnapshot = {
	foregroundPackage: string;
	webUrl: string;
	headerTexts: string[];
	/** true si el WebView muestra el formulario de login (sin sesión). */
	loggedOut: boolean;
};

const FR_REQUIRED_KEYS = ['DRIVER_EMAIL_FR', 'DRIVER_PASSWORD_FR', 'DRIVER_DISPLAY_NAME_FR'] as const;

/** Fail-fast: nombra TODAS las claves faltantes, sin imprimir valores. */
export function readFrPreflightExpectation(appPackage: string): DriverPreflightExpectation {
	const missing = FR_REQUIRED_KEYS.filter(k => !process.env[k]?.trim());
	if (missing.length > 0) {
		throw new Error(
			`Faltan variables del chofer FR: ${missing.join(', ')}. ` +
				'Definilas en el archivo de entorno (ver .env.emulator-test-fr.example); no se imprimen sus valores.'
		);
	}
	return { appPackage, driverDisplayName: process.env.DRIVER_DISPLAY_NAME_FR!.trim() };
}

const normalize = (v: string): string =>
	v
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '');

/** Devuelve la lista de violaciones; vacía = OK. */
export function evaluateDriverPreflight(
	snapshot: DriverPreflightSnapshot,
	expected: DriverPreflightExpectation
): string[] {
	const violations: string[] = [];

	if (snapshot.loggedOut) violations.push('la app está deslogueada (formulario de login visible)');

	if (snapshot.foregroundPackage !== expected.appPackage) {
		violations.push(
			`app en primer plano "${snapshot.foregroundPackage || '<desconocida>'}" != esperada "${expected.appPackage}"`
		);
	}

	const want = normalize(expected.driverDisplayName);
	if (!want || !snapshot.headerTexts.some(t => normalize(t).includes(want))) {
		violations.push('el chofer logueado no coincide con el chofer FR esperado (nombre no visible en el header del home)');
	}

	const busyStages = ['confirm', 'in-progress', 'resume'] as const;
	for (const stage of busyStages) {
		const token = DRIVER_CHECKPOINT_SELECTORS[stage].urlTokens.find(t => snapshot.webUrl.includes(t));
		if (token) violations.push(`ya hay un viaje en curso (stage "${stage}", URL contiene ${token})`);
	}

	return violations;
}

/** Lee el estado actual de la app (solo lectura) y deja el contexto en WEBVIEW. */
export async function captureDriverPreflightSnapshot(driver: AppiumDriver): Promise<DriverPreflightSnapshot> {
	const foregroundPackage = await driver.getCurrentPackage().catch(() => '');
	const contexts = (await driver.getContexts().catch(() => [])) as string[];
	const webview = contexts.find(c => c.startsWith('WEBVIEW'));
	if (!webview) return { foregroundPackage, webUrl: '', headerTexts: [], loggedOut: false };

	await driver.switchContext(webview);
	const info = await driver
		.execute<{ url: string; texts: string[]; loggedOut: boolean }, []>(() => {
			const texts: string[] = [];
			document
				.querySelectorAll(
					'page-home ion-header *, page-home .header *, ion-header *, [class*="driver-name"], [class*="user-name"]'
				)
				.forEach(el => {
					const t = String((el as HTMLElement).innerText ?? '')
						.replace(/\s+/g, ' ')
						.trim();
					if (t && t.length < 60) texts.push(t);
				});
			const pwd = document.querySelector('input[type="password"]') as HTMLElement | null;
			const loggedOut = !!pwd && pwd.offsetParent !== null;
			return { url: window.location.href, texts: Array.from(new Set(texts)), loggedOut };
		})
		.catch(() => ({ url: '', texts: [] as string[], loggedOut: false }));

	return { foregroundPackage, webUrl: info.url, headerTexts: info.texts, loggedOut: info.loggedOut };
}

/** Login por WebView (ion-input con shadow DOM). Solo se invoca si la app está deslogueada. */
async function loginDriver(driver: AppiumDriver, email: string, password: string): Promise<boolean> {
	const result = await driver
		.execute<string, [string, string]>((em: string, pw: string): string => {
			const set = (host: Element | null, val: string): boolean => {
				if (!host) return false;
				const inner = (host.querySelector('input') ||
					(host as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot?.querySelector('input')) as HTMLInputElement | null;
				if (!inner) return false;
				const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
				setter?.call(inner, val);
				inner.dispatchEvent(new Event('input', { bubbles: true }));
				inner.dispatchEvent(new Event('change', { bubbles: true }));
				host.dispatchEvent(new CustomEvent('ionInput', { bubbles: true, detail: { value: val } }));
				host.dispatchEvent(new CustomEvent('ionChange', { bubbles: true, detail: { value: val } }));
				return true;
			};
			const ions = Array.from(document.querySelectorAll('ion-input')) as HTMLElement[];
			let emailHost: Element | null = null;
			let passHost: Element | null = null;
			for (const ion of ions) {
				const inner = ion.querySelector('input') || ion.shadowRoot?.querySelector('input');
				const type = inner?.getAttribute('type') || ion.getAttribute('type') || '';
				if (/password/i.test(type)) passHost = ion;
				else if (!emailHost) emailHost = ion;
			}
			const okE = set(emailHost, em);
			const okP = set(passHost, pw);
			const btn = (Array.from(document.querySelectorAll('button, [role="button"], ion-button')) as HTMLElement[]).find(
				b => /entrar|ingresar|login|iniciar/i.test((b.innerText || b.textContent || '').trim()) && b.offsetParent !== null
			);
			if (!okE || !okP || !btn) return 'incomplete';
			btn.click();
			return 'submitted';
		}, email, password)
		.catch(() => 'error');
	return result === 'submitted';
}

export type PreflightOptions = {
	/** Se ejecuta tras un login exitoso (ej: cerrar el overlay /pre-home) antes de re-verificar la identidad. */
	afterLogin?: () => Promise<unknown>;
	loginTimeoutMs?: number;
};

/**
 * Pre-flight completo. Orden: (1) lee el estado; (2) SOLO si la app está deslogueada, hace login con
 * las credenciales FR; (3) evalúa app/chofer/viaje y lanza con todas las violaciones si hay alguna.
 */
export async function assertDriverPreflight(
	driver: AppiumDriver,
	expected: DriverPreflightExpectation,
	options: PreflightOptions = {}
): Promise<DriverPreflightSnapshot> {
	let snapshot = await captureDriverPreflightSnapshot(driver);

	if (snapshot.loggedOut && snapshot.foregroundPackage === expected.appPackage) {
		const email = process.env.DRIVER_EMAIL_FR?.trim();
		const password = process.env.DRIVER_PASSWORD_FR?.trim();
		if (!email || !password) throw new Error('App deslogueada y faltan DRIVER_EMAIL_FR / DRIVER_PASSWORD_FR para el login.');
		if (!(await loginDriver(driver, email, password))) {
			throw new Error('Pre-flight del Driver abortado: no se pudo completar el formulario de login.');
		}
		const deadline = Date.now() + (options.loginTimeoutMs ?? 40_000);
		do {
			await driver.pause(1_000);
			if (options.afterLogin) await options.afterLogin().catch(() => undefined);
			snapshot = await captureDriverPreflightSnapshot(driver);
		} while (snapshot.loggedOut && Date.now() < deadline);
	}

	const violations = evaluateDriverPreflight(snapshot, expected);
	if (violations.length > 0) {
		throw new Error(`Pre-flight del Driver abortado: ${violations.join('; ')}.`);
	}
	return snapshot;
}
