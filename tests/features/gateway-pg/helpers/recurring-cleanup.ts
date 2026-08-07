/**
 * recurring-cleanup.ts — Limpieza de VIAJES RECURRENTES creados durante tests.
 *
 * POR QUÉ NO ALCANZA `cancelTravel` — el alta recurrente crea DOS cosas con un solo
 * POST /carriers/{id}/travels (fuente BE `TravelService.java` ~1577: si
 * `recurringValue > 0 || recurringPattern == WEEKLY` → `recurringTripService.createRecurringTrip`
 * y el Travel guardado queda linkeado a esa recurrencia):
 *   1. el Travel PROGRAMADO de la primera ocurrencia, y
 *   2. el contenedor RecurringTrip que sigue generando ocurrencias futuras.
 * Cancelar solo el travelId capturado deja la recurrencia VIVA generando viajes — la suite
 * degrada con cada corrida (holds acumulados + limitExceeded, mismo modo de fallo que
 * documenta `travel-cleanup.ts`).
 *
 * Endpoints (fuente FE/BE — ingeniería inversa, rutas confirmadas en código):
 *   - GET  /magiis-v0.2/carriers/{carrierId}/recurringTrip/paginated?page&size&column&sort&status&find
 *       FE `getRecurringTrip.command.ts` · BE `RecurringTripController.java` @GetMapping.
 *       Respuesta: Spring Page → `{ content: [{ id, carrierId, passengerName, ... }] }`
 *       (shape FE `apiInterfaces.d.ts` → `RecurringTripGrid`).
 *   - PUT  /magiis-v0.2/carriers/{carrierId}/recurringTrip/{recurringId}/delete?reasonToCancel=...
 *       body `{ userId }` (BE lee `CancelUserIdRequestDTO.getUserId()`). El BE ejecuta
 *       `travelService.deleteByRecurringTrip` (cancela las instancias pendientes) + delete
 *       de la recurrencia — exactamente el cleanup que este helper necesita.
 *       FE `deleteRecurringTrip.command.ts` · BE `RecurringTripController.java` @PutMapping.
 *
 * FRAGILE / TODO(live): rutas y shapes salen del código fuente (no de una corrida viva).
 * El mapeo de `column=0` a la columna id no está confirmado → la selección del "más nuevo"
 * NO depende del orden del server: se toma el max(id) del contenido devuelto.
 */
import type { Page } from '@playwright/test';

import { getApiHeaders } from './card-precondition';

/** Mismos defaults overridables que travel-cleanup.ts (no-secretos, estables en TEST). */
const DEFAULT_CARRIER_ID = process.env.CARRIER_ID ?? '1521';
const DEFAULT_CARRIER_USER_ID = process.env.CARRIER_USER_ID ?? '6715';

function resolveApiBase(page: Page): string {
	const baseUrl = process.env.BASE_URL ?? new URL(page.url()).origin;
	return `${baseUrl}/magiis-v0.2`;
}

/** Fila del listado de recurrencias (subset del `RecurringTripResponseDTO` del FE). */
export interface RecurringTripRow {
	id: number;
	passengerName?: string;
	[key: string]: unknown;
}

/**
 * GET crudo del listado de recurrencias ACTIVAS filtrado por `find`. Devuelve `null` cuando el
 * request FALLÓ (no-OK, shape inesperado o excepción) — a diferencia de `[]`, que significa
 * "el server respondió y no hay recurrencias". La distinción importa para el snapshot pre-alta
 * (`maxActiveRecurringTripId`): un fallo tratado como lista vacía haría creer que el max id es 0
 * y el cleanup anclado podría borrar una recurrencia AJENA.
 */
async function fetchActiveRecurringTripsOrNull(
	page: Page,
	find: string,
	carrierId = DEFAULT_CARRIER_ID
): Promise<RecurringTripRow[] | null> {
	const apiBase = resolveApiBase(page);
	const url =
		`${apiBase}/carriers/${carrierId}/recurringTrip/paginated` +
		`?page=0&size=50&column=0&sort=DESC&status=ACTIVE&find=${encodeURIComponent(find)}`;
	const headers = await getApiHeaders(page);

	try {
		const response = await page.request.get(url, { headers });
		if (!response.ok()) {
			console.warn(
				`[recurring-cleanup] GET recurringTrip/paginated ${response.status()} — listado NO disponible`
			);
			return null;
		}
		const data = (await response.json().catch(() => null)) as
			| { content?: RecurringTripRow[] }
			| RecurringTripRow[]
			| null;
		if (data === null) {
			console.warn('[recurring-cleanup] GET recurringTrip/paginated devolvió un body no-JSON — listado NO disponible');
			return null;
		}
		const rows = Array.isArray(data) ? data : (data.content ?? []);
		return rows.filter((row): row is RecurringTripRow => typeof row?.id === 'number');
	} catch (err) {
		console.warn('[recurring-cleanup] listActiveRecurringTrips falló:', err);
		return null;
	}
}

/**
 * Lista las recurrencias ACTIVAS del carrier filtradas por `find` (misma búsqueda que usa
 * la UI del listado — el input `.search-header` alimenta el mismo query param).
 *
 * Devuelve `[]` ante cualquier respuesta no-OK o shape inesperado: es un helper de CLEANUP,
 * su fallo no debe tapar el desenlace del test (misma política silent-fail que
 * `cleanupGatewayCardByLast4`). El detalle queda en consola para diagnóstico. Si el caller
 * necesita distinguir "listado falló" de "no hay recurrencias", usar
 * `maxActiveRecurringTripId` / `findRecurringTripCreatedAfter`.
 */
export async function listActiveRecurringTrips(
	page: Page,
	find: string,
	carrierId = DEFAULT_CARRIER_ID
): Promise<RecurringTripRow[]> {
	return (await fetchActiveRecurringTripsOrNull(page, find, carrierId)) ?? [];
}

/**
 * SNAPSHOT pre-alta: máximo id de recurrencia ACTIVA que matchea `find`, para ANCLAR el cleanup
 * del orquestador — sólo se borra una recurrencia con id ESTRICTAMENTE mayor (creada después
 * del snapshot). Sin este anclaje, un `find` laxo ('smith') matchea recurrencias de OTROS pax
 * ('Nayla Smith') y el borrado del "más nuevo" destruye datos ajenos (review HIGH-1).
 *
 * @returns el max id (0 si el server respondió sin recurrencias) o `null` si el listado FALLÓ —
 * con `null` el cleanup anclado NO debe borrar nada (se prefiere el leak, diagnosticable por
 * warn, antes que borrar una recurrencia ajena).
 */
export async function maxActiveRecurringTripId(
	page: Page,
	find: string,
	carrierId = DEFAULT_CARRIER_ID
): Promise<number | null> {
	const rows = await fetchActiveRecurringTripsOrNull(page, find, carrierId);
	if (rows === null) return null;
	return rows.reduce((max, row) => Math.max(max, row.id), 0);
}

/**
 * Resuelve la recurrencia creada DESPUÉS del snapshot (`id > maxIdBefore`) que matchea `find`
 * — la más nueva si hubiera varias. Sirve de oráculo de identidad ("el alta de ESTA corrida
 * creó una recurrencia") y de blanco exacto para el cleanup anclado.
 *
 * @returns la fila creada tras el snapshot, o `null` si no hay ninguna (o el listado falló).
 */
export async function findRecurringTripCreatedAfter(
	page: Page,
	find: string,
	maxIdBefore: number,
	carrierId = DEFAULT_CARRIER_ID
): Promise<RecurringTripRow | null> {
	const created = (await listActiveRecurringTrips(page, find, carrierId)).filter(row => row.id > maxIdBefore);
	if (!created.length) return null;
	return created.reduce((max, row) => (row.id > max.id ? row : max));
}

/**
 * Elimina una recurrencia por id. El BE cancela ADEMÁS todas sus instancias pendientes
 * (`deleteByRecurringTrip`) — no hace falta cancelar el travel de la primera ocurrencia aparte.
 *
 * @returns true si el backend aceptó el borrado.
 */
export async function deleteRecurringTripViaApi(
	page: Page,
	recurringId: number,
	opts: { carrierId?: string; carrierUserId?: string; reason?: string } = {}
): Promise<boolean> {
	const carrierId = opts.carrierId ?? DEFAULT_CARRIER_ID;
	const carrierUserId = Number(opts.carrierUserId ?? DEFAULT_CARRIER_USER_ID);
	const reason = opts.reason ?? 'QA cleanup (suite gateway-pg)';

	const apiBase = resolveApiBase(page);
	const url = `${apiBase}/carriers/${carrierId}/recurringTrip/${recurringId}/delete?reasonToCancel=${encodeURIComponent(reason)}`;
	const headers = await getApiHeaders(page);

	try {
		const response = await page.request.put(url, { data: { userId: carrierUserId }, headers });
		if (!response.ok()) {
			console.warn(
				`[recurring-cleanup] delete recurrencia ${recurringId} falló: ${response.status()} ${response.statusText()}`
			);
			return false;
		}
		console.log(
			`[recurring-cleanup] ✓ Recurrencia ${recurringId} eliminada (instancias pendientes canceladas por el BE)`
		);
		return true;
	} catch (err) {
		console.warn(`[recurring-cleanup] Error eliminando recurrencia ${recurringId}:`, err);
		return false;
	}
}

/**
 * Borra la recurrencia creada DESPUÉS del snapshot (`id > maxIdBefore`) que matchea `find`.
 * Pensado para el `finally` del orquestador, en pareja con `maxActiveRecurringTripId` tomado
 * ANTES del alta.
 *
 * PREMISA DE SEGURIDAD (review HIGH-1): la corrida serializada garantiza que la recurrencia
 * más nueva POSTERIOR al snapshot es la de esta corrida, pero NO garantiza que "la más nueva
 * que matchea `find`" sea nuestra — un find laxo ('smith') también matchea recurrencias
 * preexistentes de otros pax ('Nayla Smith'). Por eso el borrado exige `id > maxIdBefore`:
 * si el alta no llegó a crear recurrencia, acá no se borra NADA (warn + leak diagnosticable),
 * jamás una ajena.
 *
 * @returns el id borrado, o null si no había recurrencia posterior al snapshot (o falló el borrado).
 */
export async function deleteRecurringTripNewerThan(
	page: Page,
	find: string,
	maxIdBefore: number,
	reason?: string
): Promise<number | null> {
	const newest = await findRecurringTripCreatedAfter(page, find, maxIdBefore);
	if (!newest) {
		console.warn(
			`[recurring-cleanup] sin recurrencias ACTIVAS con id > ${maxIdBefore} para find="${find}" — nada creado por esta corrida, no se borra`
		);
		return null;
	}
	const deleted = await deleteRecurringTripViaApi(page, newest.id, { reason });
	return deleted ? newest.id : null;
}
