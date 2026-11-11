/**
 * GpsSimulationPBO — simulación de posición/recorrido GPS del dispositivo con resultado tipado.
 * Envuelve `GpsRouteFeeder` SIN cambiar su comportamiento (mismo `mobile: setGeolocation` con speed,
 * mismo interpolado y cadencia fija). Sin locators ni `process.env`: la ruta llega por argumento
 * (resuelta por `data/carriers.loadCarrierRoute`).
 *
 * NO libera el mock al terminar (`adb shell am stopservice io.appium.settings/.LocationService`):
 * eso es del operador/orquestador, igual que en el feeder.
 */

import type { AppiumDriver } from '../base/AppiumSessionBase';
import type { MobileSession } from '../core/MobileSession';
import { GpsRouteFeeder, type GpsFeederOptions, type LatLng } from '../gps/GpsRouteFeeder';

export type GpsDriveOptions = GpsFeederOptions;

export type GpsDriveResult = {
	/** Distancia teórica de la ruta interpolada completa, en metros. */
	theoreticalMeters: number;
	/** Distancia teórica recorrida hasta el último punto enviado, en metros. */
	fedMeters: number;
	pointsSent: number;
	pointsTotal: number;
	aborted: boolean;
};

export type GpsPositionOptions = {
	/** m/s. Default 0 (posición estática: un solo fix no mide km). */
	speed?: number;
	bearing?: number;
	accuracyMeters?: number;
	altitude?: number;
};

/** Superficie mínima del feeder que usa el PBO (inyectable en unit). */
export type GpsFeederLike = {
	feed(route: LatLng[]): Promise<{
		theoreticalMeters: number;
		fedMeters: number;
		pointsFed: number;
		pointsTotal: number;
		aborted: boolean;
	}>;
	abort(): void;
};

export type GpsSimulationDeps = {
	/** Ejecuta un comando `mobile:` en el dispositivo. */
	execute: (command: string, args: Record<string, unknown>) => Promise<unknown>;
	createFeeder: (options: GpsDriveOptions) => GpsFeederLike;
};

export class GpsSimulationPBO {
	private active: GpsFeederLike | null = null;

	constructor(private readonly deps: GpsSimulationDeps) {}

	static forSession(session: MobileSession): GpsSimulationPBO {
		return GpsSimulationPBO.forDriver(session.driver);
	}

	/** Para consumidores que solo tienen el driver (p. ej. el callback `duringTrip` del harness). */
	static forDriver(driver: AppiumDriver): GpsSimulationPBO {
		return new GpsSimulationPBO({
			execute: (command, args) => driver.execute(command, args),
			createFeeder: options => new GpsRouteFeeder(driver, options)
		});
	}

	/** Fija UN fix en `point` (mobile: setGeolocation con speed/bearing/accuracy). */
	async positionAt(point: LatLng, options: GpsPositionOptions = {}): Promise<void> {
		await this.deps.execute('mobile: setGeolocation', {
			latitude: point.lat,
			longitude: point.lng,
			altitude: options.altitude ?? 15,
			speed: options.speed ?? 0,
			bearing: options.bearing ?? 0,
			accuracy: options.accuracyMeters ?? 5
		});
	}

	/** Recorre la ruta a cadencia fija; resuelve con lo enviado (`aborted: true` si se cortó). */
	async driveRoute(route: LatLng[], options: GpsDriveOptions = {}): Promise<GpsDriveResult> {
		const feeder = this.deps.createFeeder(options);
		this.active = feeder;
		try {
			const r = await feeder.feed(route);
			return {
				theoreticalMeters: r.theoreticalMeters,
				fedMeters: r.fedMeters,
				pointsSent: r.pointsFed,
				pointsTotal: r.pointsTotal,
				aborted: r.aborted
			};
		} finally {
			this.active = null;
		}
	}

	/** Corta el recorrido en curso (no-op si no hay). */
	abort(): void {
		this.active?.abort();
	}
}
