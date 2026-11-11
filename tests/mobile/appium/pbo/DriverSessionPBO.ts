/**
 * DriverSessionPBO — sesión del chofer: login (solo si la app está deslogueada), salir del overlay
 * `/pre-home` y quedar «Disponible» (online). Devuelve la identidad operativa.
 *
 * DELEGACIÓN A LEGADO (no hay screens migradas para esto; no se inventan selectores):
 *  - login + verificación de identidad/paquete: `assertDriverPreflight` (`driver/DriverTripPreflight`).
 *  - overlay `/pre-home`, estado online y `#availability`: `DriverHomeScreen`.
 * TODO(paso 3+): migrar login y home a `screens/driver/{LoginScreen,HomeScreen}` y reemplazar los deps.
 * Las credenciales viajan dentro de `DriverPreflightExpectation` (las arma `readDriverPreflightExpectation`
 * desde el perfil); este PBO no lee `process.env` ni las imprime.
 */

import type { MobileSession } from '../core/MobileSession';
import { DriverHomeScreen } from '../driver/DriverHomeScreen';
import {
	assertDriverPreflight,
	type DriverPreflightExpectation,
	type DriverPreflightSnapshot
} from '../driver/DriverTripPreflight';

export type DriverIdentity = {
	driverDisplayName: string;
	appPackage: string;
	online: boolean;
};

export class DriverNotOnlineError extends Error {
	constructor() {
		super('[DriverSessionPBO] El chofer no quedó «Disponible» tras goOnline().');
		this.name = 'DriverNotOnlineError';
	}
}

export type DriverSessionPboDeps = {
	/** Login condicional + verificación de identidad (legado). `afterLogin` cierra el overlay pre-home. */
	preflight: (
		expected: DriverPreflightExpectation,
		options: { afterLogin: () => Promise<unknown> }
	) => Promise<DriverPreflightSnapshot>;
	home: Pick<DriverHomeScreen, 'dismissPreHomeOverlayIfPresent' | 'goOnline' | 'isDriverOnline'>;
};

export class DriverSessionPBO {
	constructor(
		private readonly deps: DriverSessionPboDeps,
		private readonly log: (message: string) => void = m => console.log(m)
	) {}

	static forSession(session: MobileSession, log?: (message: string) => void): DriverSessionPBO {
		const home = new DriverHomeScreen(session.config, session.driver);
		return new DriverSessionPBO(
			{
				preflight: (expected, options) => assertDriverPreflight(session.driver, expected, options),
				home
			},
			log
		);
	}

	/** Asegura sesión iniciada con la identidad esperada (login solo si hace falta). */
	async ensureLoggedIn(expected: DriverPreflightExpectation): Promise<DriverIdentity> {
		await this.deps.preflight(expected, { afterLogin: () => this.deps.home.dismissPreHomeOverlayIfPresent() });
		this.log(`[DriverSessionPBO] Sesión verificada para «${expected.driverDisplayName}».`);
		return { driverDisplayName: expected.driverDisplayName, appPackage: expected.appPackage, online: false };
	}

	/** Cierra el overlay pre-home y deja al chofer «Disponible». Lanza si no queda online. */
	async ensureOnline(): Promise<boolean> {
		await this.deps.home.dismissPreHomeOverlayIfPresent();
		await this.deps.home.goOnline();
		if (!(await this.deps.home.isDriverOnline())) throw new DriverNotOnlineError();
		return true;
	}

	/** Login (si hace falta) + online; devuelve la identidad con `online: true`. */
	async startSession(expected: DriverPreflightExpectation): Promise<DriverIdentity> {
		const identity = await this.ensureLoggedIn(expected);
		const online = await this.ensureOnline();
		return { ...identity, online };
	}
}
