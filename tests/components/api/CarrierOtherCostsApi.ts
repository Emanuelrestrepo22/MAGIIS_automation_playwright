/**
 * KATA Component (Layer 3) — Catálogo de Otros Costos del carrier (Universal F1, MG-995).
 *
 * Precondición y limpieza de las specs de Otros Costos: crea el concepto que la prueba necesita,
 * lo lee para el oráculo de catálogo y lo borra al final. No es el objeto bajo prueba.
 *
 * Endpoints (portal carrier V2 v2.0.17, `settings-otherCosts.component.ts`):
 *   - search: POST carriers/{carrierId}/otherCosts/search  body {carrierId, name:'', type:'', apply:null, serviceTypeId:null}
 *   - new:    POST carriers/{carrierId}/otherCosts/new     → devuelve el concepto creado con su id
 *   - delete: POST carriers/{carrierId}/otherCosts/delete  body {carrierId, id, userId}
 *
 * Guardas: sólo crea y borra conceptos con el prefijo de la automatización y NUNCA toca los
 * conceptos preexistentes del carrier 1481 (27, 34, 38). El borrado lógico no altera los viajes
 * que ya usaron el concepto: su `otherCostList` lo conserva (medido en UAT el 29/09/2026).
 */

import type { TestContextOptions } from '@TestContext';

import { ApiBase } from '@api/ApiBase';
import { assertOkResponse, type CarrierStorageSession } from '@features/other-costs/helpers/carrierStorageSession';

/** Prefijo obligatorio de todo concepto que crea o borra esta automatización. */
export const OTHER_COSTS_E2E_PREFIX = 'QA E2E OC ';

/** Conceptos preexistentes del carrier 1481 que la automatización nunca edita ni borra. */
export const PROTECTED_OTHER_COST_IDS: readonly number[] = [27, 34, 38];

export type OtherCostApply = 'CARRIER' | 'CONTRACTOR' | 'PASSENGER' | 'DRIVER';

export type OtherCostItem = {
	id: number;
	concept: string;
	conceptType: string;
	conceptValue: number | null;
	maxValue: number | null;
	apply: OtherCostApply[];
	isCommisionable: boolean;
	isByCost: boolean;
	conceptValueCost: number | null;
	currency: { currencyId: number; code: string; symbol: string } | null;
	[extra: string]: unknown;
};

export type NewFixedOtherCost = {
	name: string;
	/** Importe de venta. */
	conceptValue: number;
	apply: OtherCostApply[];
	isCommisionable: boolean;
	/** Costo ON/OFF y su importe (ON exige importe > 0). */
	isByCost: boolean;
	conceptValueCost: number;
	currencyId: number;
};

const API_PREFIX = (process.env.MAGIIS_API_PREFIX ?? 'magiis-v0.2').replace(/^\/+|\/+$/g, '');

export class CarrierOtherCostsApi extends ApiBase {
	constructor(
		options: TestContextOptions,
		private readonly session: CarrierStorageSession
	) {
		super(options);
		this.setAuthToken(session.bearerToken());
	}

	private path(action: 'search' | 'new' | 'delete'): string {
		return `/${API_PREFIX}/carriers/${this.session.carrierId}/otherCosts/${action}`;
	}

	/** Catálogo completo del carrier (solo lectura). */
	async search(): Promise<OtherCostItem[]> {
		const [response, body] = await this.apiPOST<unknown>(this.path('search'), {
			carrierId: String(this.session.carrierId),
			name: '',
			type: '',
			apply: null,
			serviceTypeId: null
		});
		await assertOkResponse('otherCosts/search', response);
		if (!Array.isArray(body)) throw new Error('[otherCosts] search no devolvió un array');
		return body as OtherCostItem[];
	}

	/** Crea un concepto tipo Fijo propio y devuelve la fila creada (con su id). */
	async createFixed(input: NewFixedOtherCost): Promise<OtherCostItem> {
		if (!input.name.startsWith(OTHER_COSTS_E2E_PREFIX)) {
			throw new Error(`[otherCosts] «${input.name}» no lleva el prefijo «${OTHER_COSTS_E2E_PREFIX}»: no se crea`);
		}
		const [response, created] = await this.apiPOST<Partial<OtherCostItem>>(this.path('new'), {
			carrierId: this.session.carrierId,
			name: input.name,
			type: 'FIX',
			conceptValue: input.conceptValue,
			maxValue: null,
			apply: input.apply,
			isCommisionable: input.isCommisionable,
			userId: this.session.subUserId,
			isByCost: input.isByCost,
			conceptValueCost: input.conceptValueCost,
			maxCostValue: 0,
			currencyId: input.currencyId
		});
		await assertOkResponse('otherCosts/new', response);
		if (typeof created.id === 'number' && created.concept === input.name) return created as OtherCostItem;
		const found = (await this.search()).filter(item => item.concept === input.name);
		if (found.length !== 1) {
			throw new Error(
				`[otherCosts] new respondió OK pero «${input.name}» aparece ${found.length} veces en search`
			);
		}
		return found[0];
	}

	/**
	 * Borra un concepto propio. Confirma por search que existe y lleva el prefijo antes de borrar.
	 * Devuelve false si ya no estaba (limpieza idempotente).
	 */
	async remove(id: number): Promise<boolean> {
		if (PROTECTED_OTHER_COST_IDS.includes(id)) {
			throw new Error(`[otherCosts] el concepto ${id} es preexistente y protegido: no se toca`);
		}
		const current = (await this.search()).find(item => item.id === id);
		if (!current) return false;
		if (!current.concept.startsWith(OTHER_COSTS_E2E_PREFIX)) {
			throw new Error(`[otherCosts] el concepto ${id} («${current.concept}») no es de la automatización`);
		}
		const [response] = await this.apiPOST(this.path('delete'), {
			carrierId: this.session.carrierId,
			id,
			userId: this.session.subUserId
		});
		await assertOkResponse('otherCosts/delete', response);
		return true;
	}
}
