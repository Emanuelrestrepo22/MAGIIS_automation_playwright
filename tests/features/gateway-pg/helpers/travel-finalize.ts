/**
 * travel-finalize.ts — Finalización ADMINISTRATIVA de viajes por API (precondición "viaje FINALIZADO").
 *
 * Existe para destrabar los specs de CLONACIÓN DE VIAJES FINALIZADOS (TS-STRIPE-P2-TC072..077):
 * completar un viaje "de verdad" exige la App Driver (aceptar + recorrer + cobrar), pero el BE
 * expone la finalización administrativa que el propio portal carrier usa (botón bandera
 * `fa-flag-checkered` → `POST /carriers/{carrierId}/travels/{travelId}/finalizeAdmin`).
 *
 * Evidencia (ingeniería inversa magiis-be `TravelStateEngine.changeTravelStatusMachineTo`):
 *   - La máquina de estados admite CANCELLED → DONE ("Manual: Del 3 puede ser finaliz
 *     administrativo"). Secuencia web-only: alta → cancel (libera el hold) → finalizeAdmin → DONE.
 *   - El endpoint EXIGE un `driverId` real (≠ 0) con VEHÍCULO vigente
 *     (`findCurrentVehicleByDriver(driverId)`); sin driver asignado en el viaje, va en el body.
 *   - ⚠️ CAVEAT de fidelidad: para viajes pagados con tarjeta, el BE CONVIERTE el método a CASH al
 *     finalizar administrativamente (`paymentMethod CREDIT_CARD → CASH`, TravelController). El
 *     viaje queda DONE (etiqueta "finalización administrativa") pero SIN cobro por pasarela — la
 *     pata "Cobro desde App Driver" de la matriz NO es reproducible web-only. El sujeto de los
 *     specs de clonación (clonar un viaje FINALIZADO y dar de alta el clon con tarjeta
 *     preautorizada) se ejercita fiel; la génesis del viaje fuente queda documentada como admin.
 *
 * FRAGILE / TODO(live): flujo derivado del código FE+BE, sin corrida viva aún. Riesgos conocidos:
 *   - 406 `vehicle_inactive` si el driver elegido no tiene vehículo activo (se filtra por
 *     `vehicle != null` en el DTO; el estado del vehículo no viaja completo en `allDrivers`).
 *   - Validación de cupos (`validateServiceTypeUse`) si el pax fuera colaborador de contractor
 *     con cupo agotado — los actores de estos specs (empresa individuo / app pax) no lo son.
 */
import type { Page } from '@playwright/test';
import { getApiHeaders } from './card-precondition';

/** Mismos IDs estables de TEST que `travel-cleanup.ts` (no son secretos — ver su JSDoc). */
const DEFAULT_CARRIER_ID = process.env.CARRIER_ID ?? '1521';
const DEFAULT_CARRIER_USER_ID = process.env.CARRIER_USER_ID ?? '6715';

/** Subconjunto tipado del DriverResponseDTO del BE que consume la resolución de driver. */
type CarrierDriverDTO = {
	driverUserId?: number;
	firstName?: string;
	lastName?: string;
	driverState?: string;
	vehicle?: { id?: number } | null;
};

function resolveApiBase(page: Page): string {
	const baseUrl = process.env.BASE_URL ?? new URL(page.url()).origin;
	return `${baseUrl}/magiis-v0.2`;
}

/**
 * Resuelve el `driverId` a usar en la finalización administrativa.
 *
 * Precedencia: env `FINALIZE_DRIVER_ID` (determinismo por ambiente, sin tocar código) →
 * `GET /carriers/{carrierId}/drivers/allDrivers` y primer driver CON vehículo (el BE deriva el
 * vehículo del driver vía `findCurrentVehicleByDriver`, así que un driver sin vehículo revienta).
 *
 * @returns driverId numérico, o `null` si no hay candidato (el caller decide el fail-fast).
 */
export async function resolveFinalizeDriverId(page: Page, carrierId = DEFAULT_CARRIER_ID): Promise<number | null> {
	const fromEnv = process.env.FINALIZE_DRIVER_ID?.trim();
	if (fromEnv && /^\d+$/.test(fromEnv)) {
		return Number(fromEnv);
	}

	const apiBase = resolveApiBase(page);
	const headers = await getApiHeaders(page);
	const response = await page.request.get(`${apiBase}/carriers/${carrierId}/drivers/allDrivers`, { headers });
	if (!response.ok()) {
		console.warn(`[travel-finalize] GET allDrivers falló: ${response.status()} ${response.statusText()}`);
		return null;
	}

	const drivers = (await response.json().catch(() => null)) as CarrierDriverDTO[] | null;
	if (!Array.isArray(drivers)) {
		console.warn('[travel-finalize] GET allDrivers no devolvió un array');
		return null;
	}

	const candidate = drivers.find(driver => typeof driver.driverUserId === 'number' && driver.vehicle != null);
	if (!candidate) {
		console.warn(`[travel-finalize] Ningún driver del carrier ${carrierId} tiene vehículo vigente (${drivers.length} drivers)`);
		return null;
	}

	console.log(
		`[travel-finalize] driver resuelto para finalizeAdmin: id=${candidate.driverUserId} ` +
			`${candidate.firstName ?? ''} ${candidate.lastName ?? ''} (state=${candidate.driverState ?? '?'})`
	);
	return candidate.driverUserId as number;
}

/**
 * Finaliza ADMINISTRATIVAMENTE un viaje vía `POST /carriers/{carrierId}/travels/{travelId}/finalizeAdmin`.
 *
 * Payload replicado del command del FE (`finalizeAdminTravel.command.ts`):
 * `{ carrierUserId, travelId, userId, userIdManager, driverId }` — `carrierUserId` es el id de la
 * CUENTA carrier (URL) y `userId`/`userIdManager` el sub-usuario dispatcher (`subUserId`), igual
 * que `doVerifyUserPermission` en el FE.
 *
 * Precondición de estado: el viaje debe estar en un estado desde el que la máquina admita DONE
 * (GOING_TO_x, CLOSING_TRAVEL, NO_PAY, NO_AUTH o CANCELLED). Para la precondición de clonación
 * se usa la transición CANCELLED → DONE (viaje recién cancelado por `cancelTravel`).
 *
 * @returns true si el BE aceptó la finalización; false (con warn) si la rechazó.
 */
export async function finalizeTravelAdmin(
	page: Page,
	travelId: number,
	opts: { carrierId?: string; carrierUserId?: string; driverId?: number } = {}
): Promise<boolean> {
	const carrierId = opts.carrierId ?? DEFAULT_CARRIER_ID;
	const carrierUserId = opts.carrierUserId ?? DEFAULT_CARRIER_USER_ID;
	const driverId = opts.driverId ?? (await resolveFinalizeDriverId(page, carrierId));

	if (driverId == null) {
		console.warn('[travel-finalize] Sin driverId resoluble — el BE rechaza finalizar sin chofer (DRIVER_NOT_FOUND)');
		return false;
	}

	const apiBase = resolveApiBase(page);
	const url = `${apiBase}/carriers/${carrierId}/travels/${travelId}/finalizeAdmin`;
	const headers = await getApiHeaders(page);

	const response = await page.request.post(url, {
		data: {
			carrierUserId: Number(carrierId),
			travelId,
			userId: Number(carrierUserId),
			userIdManager: Number(carrierUserId),
			driverId
		},
		headers
	});

	if (!response.ok()) {
		const body = await response.text().catch(() => '');
		console.warn(`[travel-finalize] finalizeAdmin ${travelId} falló: ${response.status()} ${response.statusText()} ${body.slice(0, 300)}`);
		return false;
	}
	console.log(`[travel-finalize] ✓ Viaje ${travelId} finalizado administrativamente (driverId=${driverId})`);
	return true;
}
