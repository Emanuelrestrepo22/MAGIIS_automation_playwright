/**
 * Helper para resetear los contadores de uso (cupo) de service types de un carrier.
 *
 * Endpoint: PUT /magiis-v0.2/carriers/{carrierId}/serviceTypes/countsReset
 * Body: { serviceTypeId, contractorId, contractorEmployeeId, userId } — los 3 filtros
 * son opcionales (null = sin filtro); `userId` es auditoría (queda en reset_user_id).
 *
 * Es el endpoint del bug MX-6057: fallaba con ORA-00932 al resetear un service type
 * completo (filtros null bindeados como VARBINARY en SQL nativo). El fix migró la query
 * a JPQL. Modos: service type completo · por contractor · por empleado (o combinaciones).
 *
 * Resetea trips_pending/trips_done/reset_user_id/reset_date. NO resetea extra_limit.
 * El controller responde 200 + body "true" salvo HttpException; carrier inexistente → 404.
 * Un filtro que no matchea filas también responde 200 + "true" (no-op, sin validación de input).
 *
 * NO lanza — ante excepción de red devuelve { status: 0, ok: false, body }.
 * Diferenciar filas afectadas / aislamiento requiere lectura de DB (fuera de la capa API).
 */

import type { APIRequestContext } from '@playwright/test';
import { debugLog } from '../../../helpers';

export interface CarrierServiceTypeCountsResetOptions {
	/** carrierId del path (dueño de los service types a resetear). */
	carrierId: number | string;
	/** Filtro opcional por service type. */
	serviceTypeId?: number | null;
	/** Filtro opcional por contractor (dueño del service type). */
	contractorId?: number | null;
	/** Filtro opcional por colaborador. */
	contractorEmployeeId?: number | null;
	/** userId de auditoría → reset_user_id. */
	userId?: number | null;
	/** Header Authorization completo (ya incluye "Bearer "). */
	authToken: string;
	/** Override de base URL; default BASE_URL del env. */
	baseUrl?: string;
}

export interface CountsResetResponse {
	/** HTTP status (0 si hubo excepción de red). */
	status: number;
	/** res.ok() (2xx). */
	ok: boolean;
	/** Body crudo (trim). "true" en éxito. */
	body: string;
}

export async function resetCarrierServiceTypeCounts(
	request: APIRequestContext,
	opts: CarrierServiceTypeCountsResetOptions
): Promise<CountsResetResponse> {
	const baseUrl = opts.baseUrl ?? process.env.BASE_URL ?? 'https://apps-test.magiis.com';
	const url = `${baseUrl}/magiis-v0.2/carriers/${opts.carrierId}/serviceTypes/countsReset`;
	const data = {
		serviceTypeId: opts.serviceTypeId ?? null,
		contractorId: opts.contractorId ?? null,
		contractorEmployeeId: opts.contractorEmployeeId ?? null,
		userId: opts.userId ?? null
	};

	try {
		const res = await request.put(url, {
			headers: { Authorization: opts.authToken },
			data
		});
		const body = (await res.text()).trim();
		if (!res.ok()) {
			debugLog('counts-reset', `status=${res.status()} url=${url} body=${body}`);
		}
		return { status: res.status(), ok: res.ok(), body };
	} catch (err) {
		debugLog('counts-reset', `exception=${String(err)} url=${url}`);
		return { status: 0, ok: false, body: String(err) };
	}
}
