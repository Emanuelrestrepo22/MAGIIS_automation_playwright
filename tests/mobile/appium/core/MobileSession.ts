/**
 * MobileSession — sesión Appium/WebdriverIO por COMPOSICIÓN (no herencia).
 * Crea/cierra el driver con las capabilities de `config/`, conserva el `endSession` con timeout de 20 s
 * y expone `driver`, `context` y `evidence`. `AppiumSessionBase` delega acá.
 */

import { remote } from 'webdriverio';
import type { Browser } from 'webdriverio';
import type { MobileActorConfig } from '../config/appiumRuntime';
import { buildAndroidCapabilities, buildAppiumRemoteConnection } from '../config/appiumRuntime';
import { Evidence } from './Evidence';

export type MobileContext = 'native' | 'webview';

export type MobileSessionOptions = {
	/** Driver ya creado (se usa tal cual; `start` no hace nada). */
	driver?: Browser;
	/** Fábrica de driver (default: `remote` de webdriverio). Inyectable para unit. */
	remoteFn?: (options: Record<string, unknown>) => Promise<Browser>;
	/** Tope de `deleteSession` en ms (default 20 000). */
	endTimeoutMs?: number;
	log?: (message: string) => void;
	/**
	 * Opciones COMPLETAS de `remote` (protocol/hostname/port/path/logLevel/retry/capabilities) que se pasan
	 * tal cual, sin derivarlas de `config`. Para scripts de investigación con capabilities propias
	 * (p. ej. `forceAppLaunch:false` para adjuntar sin relanzar). Ver `MobileSession.open`.
	 */
	remoteOptions?: Record<string, unknown>;
};

const NATIVE_CONTEXT = 'NATIVE_APP';

export class MobileSession {
	private current: Browser | null;
	private readonly remoteFn: (options: Record<string, unknown>) => Promise<Browser>;
	private readonly endTimeoutMs: number;
	private readonly log: (message: string) => void;
	private readonly rawRemoteOptions: Record<string, unknown> | null;

	constructor(
		readonly config: MobileActorConfig,
		options: MobileSessionOptions = {}
	) {
		this.current = options.driver ?? null;
		this.remoteFn = options.remoteFn ?? (o => remote(o as unknown as Parameters<typeof remote>[0]));
		this.endTimeoutMs = options.endTimeoutMs ?? 20_000;
		this.log = options.log ?? (m => console.log(m));
		this.rawRemoteOptions = options.remoteOptions ?? null;
	}

	/**
	 * Abre una sesión con opciones de `remote` literales (sin pasar por `config`) y devuelve el driver.
	 * Comportamiento idéntico a `remote(options)`; el teardown sigue siendo responsabilidad del llamador
	 * (`driver.deleteSession()` o `MobileSession.end` si conserva la instancia).
	 */
	static async open(remoteOptions: object, options: Omit<MobileSessionOptions, 'remoteOptions'> = {}): Promise<Browser> {
		const placeholder = { appiumServerUrl: 'raw-remote-options', deviceName: 'raw', platformVersion: 'raw' } as MobileActorConfig;
		const session = new MobileSession(placeholder, { ...options, remoteOptions: remoteOptions as Record<string, unknown> });
		await session.start();
		return session.driver;
	}

	get hasDriver(): boolean {
		return this.current !== null;
	}

	/** Driver activo; lanza si la sesión no está iniciada. */
	get driver(): Browser {
		if (!this.current) throw new Error('Appium session is not started. Call startSession() first.');
		return this.current;
	}

	/** Inicia la sesión contra el emulador/dispositivo Android (idempotente). */
	async start(): Promise<void> {
		if (this.current) return;
		if (this.rawRemoteOptions) {
			this.current = await this.remoteFn(this.rawRemoteOptions);
			return;
		}
		const caps = buildAndroidCapabilities(this.config);
		const connection = buildAppiumRemoteConnection(this.config);
		this.log(`[MobileSession] Connecting to ${this.config.appiumServerUrl}...`);
		this.log(`[MobileSession] Device: ${this.config.deviceName} (Android ${this.config.platformVersion})`);
		this.log(`[MobileSession] Base path: ${connection.path}`);
		this.current = await this.remoteFn({
			protocol: connection.protocol,
			hostname: connection.hostname,
			port: connection.port,
			path: connection.path,
			capabilities: caps,
			logLevel: 'warn',
			connectionRetryTimeout: 60_000,
			connectionRetryCount: 3
		});
		this.log('[MobileSession] Session started');
	}

	/**
	 * Cierra la sesión. `deleteSession()` puede colgar si el device/appium no responde: el teardown NO
	 * debe bloquear un test cuyos asserts ya pasaron -> timeout y se libera el driver igual.
	 */
	async end(): Promise<void> {
		if (!this.current) return;
		const driver = this.current;
		this.current = null;
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([
				driver.deleteSession(),
				new Promise((_, reject) => {
					timer = setTimeout(
						() => reject(new Error(`deleteSession timeout (${Math.round(this.endTimeoutMs / 1000)}s)`)),
						this.endTimeoutMs
					);
				})
			]);
			this.log('[MobileSession] Session closed');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(`[MobileSession] end: deleteSession no completó limpiamente (${message}) — driver liberado igual.`);
		} finally {
			if (timer) clearTimeout(timer);
		}
	}

	/** Contexto actual: `native` o `webview`. */
	async context(): Promise<MobileContext> {
		const ctx = String(await this.driver.getContext());
		return ctx === NATIVE_CONTEXT ? 'native' : 'webview';
	}

	/** Cambia de contexto; `webview` elige la primera WebView disponible. Devuelve el nombre elegido. */
	async switchContext(target: MobileContext): Promise<string> {
		if (target === 'native') {
			await this.driver.switchContext(NATIVE_CONTEXT);
			return NATIVE_CONTEXT;
		}
		const contexts = (await this.driver.getContexts()).map(c => (typeof c === 'string' ? c : c.id));
		const web = contexts.find(c => c.startsWith('WEBVIEW'));
		if (!web) throw new Error('No hay WebView disponible en la sesión.');
		await this.driver.switchContext(web);
		return web;
	}

	/** Evidencia (capturas por checkpoint) agrupada por `runLabel`. */
	evidence(runLabel: string): Evidence {
		return Evidence.forDriver(() => this.driver, runLabel);
	}
}
