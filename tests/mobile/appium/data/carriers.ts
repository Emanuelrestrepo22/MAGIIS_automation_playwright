/**
 * Datos por carrier (paso 5 de la arquitectura POM+PBO): `carrierId -> {región, locale, moneda,
 * ruta GPS por defecto, perfil de chofer por ambiente}`.
 *
 * REGLA: un carrier nuevo = UNA entrada en `CARRIERS` (y, si hace falta, un JSON en
 * `gps/routes/<region>/` y un perfil en `driver/DriverProfiles.ts`). Cero lógica por carrier en
 * código: las funciones de abajo solo leen datos. La ruta se resuelve e INYECTA; no se muta
 * `process.env.GPS_ROUTE_FILE`.
 *
 * Los perfiles de chofer son ids (nombres de clave de env); aquí no hay credenciales.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MobileEnvironment } from '../config/appiumRuntime';
import type { DriverProfileId } from '../driver/DriverProfiles';
import { loadRouteFile, type LatLng } from '../gps/GpsRouteFeeder';

export type CarrierProfile = {
	carrierId: number;
	name: string;
	/** Región operativa (carpeta lógica de rutas y de textos). Texto libre, sin unión cerrada. */
	region: string;
	/** BCP-47 del idioma de la app para ese carrier. */
	locale: string;
	/** ISO 4217. */
	currency: string;
	/** Ruta GPS por defecto, relativa a `gps/routes/` (p. ej. `us/miami-brickell.json`). */
	routeId: string;
	/** Perfil de chofer por ambiente. Solo ids de `DRIVER_PROFILES`. */
	driverProfiles: Partial<Record<MobileEnvironment, DriverProfileId>>;
	/** Pendientes de verificación que el reporte debe repetir (p. ej. geocerca sin confirmar). */
	notes?: string[];
};

export type CarrierRegistry = Record<number, CarrierProfile>;

export const CARRIERS: CarrierRegistry = {
	1901: {
		carrierId: 1901,
		name: 'FR QA (carrier 1901 TEST)',
		region: 'fr',
		locale: 'fr-FR',
		currency: 'EUR',
		routeId: 'cannes-nice.json',
		driverProfiles: { test: 'fr-1901' }
	},
	1521: {
		carrierId: 1521,
		name: 'Remises EEUU (carrier 1521 TEST)',
		region: 'us',
		locale: 'en-US',
		currency: 'USD',
		routeId: 'us/miami-brickell.json',
		driverProfiles: { test: 'test-default' },
		notes: [
			'Geocerca/ciudad de 1521 sin verificar: us/miami-brickell.json es una ruta urbana corta de EE. UU., no la geocerca del carrier.'
		]
	}
};

export const GPS_ROUTES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../gps/routes');

export function getCarrier(carrierId: number, registry: CarrierRegistry = CARRIERS): CarrierProfile {
	const c = registry[carrierId];
	if (!c) {
		throw new Error(
			`Carrier ${carrierId} sin datos. Disponibles: ${Object.keys(registry).join(', ')}. Agregá una entrada en data/carriers.ts.`
		);
	}
	return c;
}

/** Perfil de chofer del carrier para el ambiente; falla nombrando carrier y ambiente. */
export function resolveDriverProfileId(carrier: CarrierProfile, env: MobileEnvironment): DriverProfileId {
	const id = carrier.driverProfiles[env];
	if (!id) throw new Error(`Carrier ${carrier.carrierId} sin perfil de chofer para el ambiente "${env}".`);
	return id;
}

/** Ruta GPS del carrier (o `routeId` explícito) como puntos; sin tocar `process.env`. */
export function loadCarrierRoute(
	carrier: CarrierProfile,
	routeId: string = carrier.routeId,
	routesDir: string = GPS_ROUTES_DIR
): LatLng[] {
	const file = path.resolve(routesDir, routeId);
	const rel = path.relative(routesDir, file);
	if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`routeId "${routeId}" fuera de gps/routes/.`);
	return loadRouteFile(file, `Ruta ${routeId} (carrier ${carrier.carrierId})`);
}
