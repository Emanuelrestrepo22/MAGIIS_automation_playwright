/**
 * KATA Steps (orquestador) — Carrier · Viajes Recurrentes.
 *
 * SCAFFOLDING MG-178 (área REC). Orquesta la edición de una recurrencia reutilizando
 * `CarrierRecurrentTravelPage` (@ui/carrier). El alta recurrente + vinculación de tarjeta reutiliza
 * el POM de alta de viaje (área hold). Anclas TS-STRIPE-P2-TC041/048/054; TC047 (crítico) requiere
 * App Driver → fuera de UI web. Flujos con hold+cobro quedan TODO(MG-178) — validación live.
 */

import type { TestContextOptions } from '@TestContext';

import { test } from '@TestFixture';
import { UiBase } from '@ui/UiBase';
import { CarrierRecurrentTravelPage } from '@ui/carrier';
import { loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';

export class RecurrentesSteps extends UiBase {
	readonly recurrent: CarrierRecurrentTravelPage;

	constructor(options: TestContextOptions) {
		super(options);
		this.recurrent = new CarrierRecurrentTravelPage({ page: this.page });
	}

	/** Ancla edición de fechas de recurrencia (scaffolding). */
	async runEditRecurrenceDates(opts: { repeatEvery?: string; endDate?: string; paxQty?: string }): Promise<void> {
		await test.step('Login carrier', async () => {
			await loginAsDispatcher(this.page);
		});
		await test.step('Abrir listado de viajes recurrentes', async () => {
			await this.recurrent.goto();
			await this.recurrent.openRecurringTab();
		});
		await test.step('Editar fechas de la recurrencia', async () => {
			await this.recurrent.editRecurrenceDates(opts);
		});
	}
}
