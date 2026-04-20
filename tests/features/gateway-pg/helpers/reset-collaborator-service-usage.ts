/**
 * Helper para resetear el contador de uso acumulado de un colaborador sobre un tipo de servicio.
 *
 * Endpoint: DELETE /magiis-v0.2/contractorEmployees/{id}/serviceType/{sid}/delete
 *
 * El endpoint devuelve "true" cuando el reset se aplicó (había uso que borrar).
 * Si el colaborador ya estaba "limpio", puede devolver "false" o 404 — ambos casos
 * son idempotentes para el test.
 *
 * Solo aplica a colaboradores (contractorEmployees). NO aplica a AppPax ni empresa-individuo.
 */

import type { APIRequestContext } from '@playwright/test';
import { debugLog } from '../../../helpers';

export interface ResetCollaboratorOptions {
	contractorEmployeeId: number;
	serviceTypeId: number;
	authToken: string;
	baseUrl?: string;
}

export type ResetResult = 'reset-done' | 'already-clean' | 'error';

export async function resetCollaboratorServiceUsage(
	request: APIRequestContext,
	opts: ResetCollaboratorOptions,
): Promise<ResetResult> {
	const baseUrl = opts.baseUrl ?? process.env.BASE_URL ?? 'https://apps-test.magiis.com';
	const url = `${baseUrl}/magiis-v0.2/contractorEmployees/${opts.contractorEmployeeId}/serviceType/${opts.serviceTypeId}/delete`;

	try {
		const res = await request.delete(url, {
			headers: { Authorization: opts.authToken },
		});
		if (!res.ok()) {
			debugLog('reset-usage', `status=${res.status()} url=${url}`);
			return 'error';
		}
		const body = (await res.text()).trim();
		return body === 'true' ? 'reset-done' : 'already-clean';
	} catch (err) {
		debugLog('reset-usage', `exception=${String(err)} url=${url}`);
		return 'error';
	}
}
