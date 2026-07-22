/**
 * KATA Component (Layer 3) — Carrier service-type counts reset API (MX-6057).
 *
 * Versión KATA del helper legacy `carrier-service-type-counts-reset.ts`: extiende
 * `ApiBase` y expone el reset de contadores de cupo como un mini-flujo ATC atómico.
 *
 * Endpoint: PUT /magiis-v0.2/carriers/{carrierId}/serviceTypes/countsReset
 * Bug MX-6057: fallaba con ORA-00932 al resetear un service type completo (filtros null en
 * SQL nativo); fix → JPQL. El controller responde 200 + "true" salvo HttpException; carrier
 * inexistente → 404. Diferenciar filas afectadas / aislamiento requiere DB (capa OracleDb).
 *
 * Convención KATA aplicada:
 *   - Extiende ApiBase (usa `this.request` del fixture).
 *   - Compone el helper HTTP legacy (`@features/...`) para no duplicar el contrato de request
 *     (auth header directo, filtros null, parse del body crudo "true", captura de excepción).
 *   - Import por alias; parámetros como objeto único.
 *
 * @atc MX-6132 — Test del ATR MX-6122 (ATP MX-6115) que cubre la operación de reset.
 */

import type { TestContextOptions } from '@TestContext';

import { ApiBase } from '@api/ApiBase';
import { atc } from '@utils/decorators';
import {
	resetCarrierServiceTypeCounts,
	type CarrierServiceTypeCountsResetOptions,
	type CountsResetResponse
} from '@features/gateway-pg/helpers/carrier-service-type-counts-reset';

export type { CarrierServiceTypeCountsResetOptions, CountsResetResponse };

export class ServiceTypeCountsApi extends ApiBase {
	constructor(options: TestContextOptions) {
		super(options);
	}

	/**
	 * Mini-flujo ATC: PUT serviceTypes/countsReset. Devuelve { status, ok, body } del contrato
	 * HTTP (no lanza ante excepción de red → status 0). El efecto por fila es aserción DB.
	 */
	@atc('MX-6132', { description: 'PUT serviceTypes/countsReset — reset de contadores de cupo del carrier' })
	async resetCounts(opts: CarrierServiceTypeCountsResetOptions): Promise<CountsResetResponse> {
		return resetCarrierServiceTypeCounts(this.request, opts);
	}
}
