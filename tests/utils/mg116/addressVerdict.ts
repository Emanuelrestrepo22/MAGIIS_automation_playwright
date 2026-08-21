/**
 * MG-116 — logica de veredicto sobre una respuesta de `places/autocomplete`, compartida.
 *
 * POR QUE EXISTE. La misma logica de negocio se necesitaba en dos lugares: el analizador de
 * payloads capturados a mano en iOS (`tests/mobile/appium/scripts/mg116-analizar-payload-ios.mjs`,
 * Node puro sin build) y ahora en la suite de contrato API (`tests/features/mg116/api/`, TypeScript
 * compilado). Portar la logica ACA en vez de duplicarla en el spec evita que las dos mediciones del
 * mismo contrato — la manual de iOS y la automatizada de API — diverjan en silencio.
 *
 * El analizador `.mjs` se deja como esta: corre standalone via `node`, sin dependencias a proposito
 * (su propio docstring lo dice), y no pasa por el compilador de TypeScript de la suite. Portar su
 * logica a un modulo TS no elimina esa duplicacion de raiz, pero sí evita agregar una TERCERA copia:
 * cualquier cambio futuro al criterio de plus-codes o de sesgo se hace ACA y en el `.mjs`, no en un
 * tercer lugar.
 */

/** Una fila de prediccion tal como la devuelve `places/autocomplete`. */
export type PlaceRow = {
	placeId: string | null;
	mainText: string;
	secondaryText?: string | null;
	shortName?: string;
	latitude: string | null;
	longitude: string | null;
	airport: boolean;
	iataCode: string | null;
	source: string;
};

export type Coords = { lat: number; lon: number };

/** CARRIERPLACE 1611 — direccion registrada del carrier 1481 UNITY US (Sunny Isles Beach, FL). */
export const CARRIER_US: Coords = { lat: 25.9300485, lon: -80.1262026 };

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: Coords, b: Coords): number {
	const rad = (d: number): number => (d * Math.PI) / 180;
	const dLat = rad(b.lat - a.lat);
	const dLon = rad(b.lon - a.lon);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Un plus code (Open Location Code) no es una direccion utilizable por un pasajero.
 *
 * Formato: 4+ caracteres del alfabeto OLC, un '+', y 2+ mas. El alfabeto excluye vocales a proposito
 * para no formar palabras, asi que el falso positivo sobre nombres de calle reales es improbable.
 * Ver MG-931 (39.605 filas en produccion cuyo formatted_address es un plus code).
 */
const RE_PLUS_CODE = /\b[23456789CFGHJMPQRVWX]{4,}\+[23456789CFGHJMPQRVWX]{2,}\b/;

export function isPlusCode(texto: string | null | undefined): boolean {
	return RE_PLUS_CODE.test(String(texto ?? ''));
}

/** Distancia de una fila al punto de referencia dado, o null si la fila no trae coordenadas. */
export function distanceKm(row: PlaceRow, from: Coords): number | null {
	const lat = Number(row.latitude);
	const lon = Number(row.longitude);
	if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
	return haversineKm({ lat, lon }, from);
}

/**
 * TM-727 — el defecto de orden: aeropuertos que matchean por NOMBRE (no por IATA) rankeados por
 * encima de direcciones de cache mucho mas cercanas al usuario.
 *
 * Devuelve el indice (0-based) de la primera fila `source: CACHE`, y cuantas filas `airport: true`
 * la preceden. El test decide el veredicto comparando esto contra el AC — esta funcion solo mide.
 */
export function airportsBeforeFirstCache(rows: PlaceRow[]): { firstCacheIndex: number; airportsAhead: number } {
	const firstCacheIndex = rows.findIndex(r => r.source === 'CACHE');
	if (firstCacheIndex === -1) return { firstCacheIndex: -1, airportsAhead: rows.filter(r => r.airport).length };
	const airportsAhead = rows.slice(0, firstCacheIndex).filter(r => r.airport).length;
	return { firstCacheIndex, airportsAhead };
}
