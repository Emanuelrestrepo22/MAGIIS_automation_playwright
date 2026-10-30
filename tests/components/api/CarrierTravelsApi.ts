/**
 * KATA Component (Layer 3) — Viajes del carrier: alta y asignación como precondición, detalle
 * como oráculo de persistencia y cancelación como limpieza.
 *
 * Endpoints (portal carrier V2 v2.0.17 y captura de red de UAT del 29/09/2026):
 *   - alta:     POST carriers/{carrierId}/travels                 body = el mismo que manda el formulario «New Trip»
 *   - asignar:  POST carriers/{carrierId}/travels/{id}/assign     body {carrierUserId, driverUserId, travelId, userId}
 *   - detalle:  GET  carriers/{carrierId}/travels/{id}
 *   - cancelar: PUT  carriers/{carrierId}/travels/{id}/cancel     body = CancelTravelRequestDTO completo
 *               (con `{}` un viaje en SEARCHING_DRIVER responde 400 ACTION_NOT_ALLOWED)
 *   - estado del chofer: GET carriers/{carrierId}/drivers/{driverId}/status
 *
 * El detalle trae PII del pasajero: la evidencia sólo toma los campos de `pickTravelMeasurement`.
 */

import type { TestContextOptions } from '@TestContext';

import { ApiBase } from '@api/ApiBase';
import { assertOkResponse, type CarrierStorageSession } from '@features/other-costs/helpers/carrierStorageSession';

export type TravelOtherCostRow = { id?: number; name?: string; price?: number; [extra: string]: unknown };

/** Campos del detalle que usa la automatización. El resto del cuerpo no se vuelca a evidencia. */
export type TravelDetail = {
	travelId?: number;
	travelIdForCarrier?: number;
	state?: string;
	paymentMethod?: string;
	amount?: number | null;
	tourPrice?: number | null;
	otherCost?: number | null;
	otherCostList?: TravelOtherCostRow[] | null;
	[extra: string]: unknown;
};

export type DriverStatus = {
	id?: number;
	state?: string;
	subState?: string;
	currentTrip?: unknown;
	incomingTripId?: number | null;
	[extra: string]: unknown;
};

/** Estados en los que un viaje ya no admite cancelación (limpieza innecesaria). */
export const TERMINAL_TRAVEL_STATES: readonly string[] = ['DONE', 'CANCELLED', 'CANCELED', 'FINALIZED'];

/** Lista blanca de campos del detalle para la evidencia (sin PII). */
export function pickTravelMeasurement(detail: TravelDetail): Record<string, unknown> {
	return {
		travelId: detail.travelId,
		travelIdForCarrier: detail.travelIdForCarrier,
		state: detail.state,
		paymentMethod: detail.paymentMethod,
		tourPrice: detail.tourPrice,
		otherCost: detail.otherCost,
		amount: detail.amount,
		otherCostList: (detail.otherCostList ?? []).map(row => ({ id: row.id, name: row.name, price: row.price }))
	};
}

const API_PREFIX = (process.env.MAGIIS_API_PREFIX ?? 'magiis-v0.2').replace(/^\/+|\/+$/g, '');

export class CarrierTravelsApi extends ApiBase {
	constructor(
		options: TestContextOptions,
		private readonly session: CarrierStorageSession
	) {
		super(options);
		this.setAuthToken(session.bearerToken());
	}

	private path(suffix = ''): string {
		return `/${API_PREFIX}/carriers/${this.session.carrierId}${suffix}`;
	}

	private travelPath(travelId: number, suffix = ''): string {
		if (!Number.isInteger(travelId) || travelId <= 0) throw new Error(`[travels] travelId inválido: ${travelId}`);
		return this.path(`/travels/${travelId}${suffix}`);
	}

	/** Alta del viaje con el body del formulario del portal. Devuelve el id y el código del carrier. */
	async create(body: Record<string, unknown>): Promise<{ travelId: number; travelIdForCarrier: number | null }> {
		if (body.carrierUserId !== this.session.carrierId) {
			throw new Error('[travels] el carrierUserId del body no es el de la sesión');
		}
		const [response, created] = await this.apiPOST<TravelDetail>(this.path('/travels'), body);
		await assertOkResponse('travels (alta)', response);
		if (typeof created.travelId !== 'number') throw new Error('[travels] el alta no devolvió travelId');
		return { travelId: created.travelId, travelIdForCarrier: created.travelIdForCarrier ?? null };
	}

	/** Asigna el viaje a un chofer (asignación manual del operador). */
	async assign(travelId: number, driverUserId: number): Promise<void> {
		const [response] = await this.apiPOST(this.travelPath(travelId, '/assign'), {
			carrierUserId: this.session.carrierId,
			driverUserId,
			travelId,
			userId: this.session.subUserId
		});
		await assertOkResponse(`travels/${travelId}/assign`, response);
	}

	/** Detalle del viaje (solo lectura). */
	async getDetail(travelId: number): Promise<TravelDetail> {
		const [response, body] = await this.apiGET<TravelDetail>(this.travelPath(travelId));
		await assertOkResponse(`travels/${travelId}`, response);
		if (!body || typeof body !== 'object') throw new Error(`[travels] el detalle de ${travelId} vino vacío`);
		return body;
	}

	/** Cancela un viaje creado por la automatización (limpieza de un viaje que quedó incompleto). */
	async cancel(travelId: number): Promise<void> {
		const [response] = await this.apiPUT(this.travelPath(travelId, '/cancel'), {
			carrierUserId: String(this.session.carrierId),
			travelId,
			reasonForCancellation: 'QA E2E OC limpieza automatizacion',
			canceledBy: this.session.role,
			name: this.session.subUserName,
			userId: String(this.session.subUserId),
			checkPassengerCancelation: false
		});
		await assertOkResponse(`travels/${travelId}/cancel`, response);
	}

	/** Estado operativo del chofer (ONLINE/OFFLINE, viaje en curso). Solo lectura. */
	async getDriverStatus(driverUserId: number): Promise<DriverStatus> {
		const [response, body] = await this.apiGET<DriverStatus>(this.path(`/drivers/${driverUserId}/status`));
		await assertOkResponse(`drivers/${driverUserId}/status`, response);
		return body;
	}
}
