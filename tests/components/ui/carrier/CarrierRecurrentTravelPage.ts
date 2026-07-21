/**
 * KATA Component (Layer 3) — Carrier · Viajes Recurrentes.
 *
 * SCAFFOLDING MG-178 (área REC). Selectores tomados de la fuente real del FE
 * (`magiis-fe`, branch release/v1.72.x):
 *   - Listado: `src/app/components/recurring-trip/recurring-list/recurring-list.component.html`
 *     (ruta carrier `/recurring`; tabs i18n `carrier.travels.recurring_trips.tab_recurring|.tab_completed|.tab_canceled`).
 *   - Edición de fechas (modal): `src/app/components/recurring-trip/recurring-edit/recurring-edit.component.html`
 *     (`#datePickerSelected`, `#recurringValue`, `#recurringEnd`, `#paxQty`).
 *   - Creación + tarjeta: `src/app/carrier/travel/add-travel/add-travel.component.html`
 *     (toggle `isRecurring`, `#recurringValue`, `formControlName="endRecurringTrip"`).
 *
 * Estado: estructura ejecutable con selectores grounded. El alta recurrente + vinculación de
 * tarjeta reutiliza el POM de alta de viaje (NewTravelPage); la edición de fechas usa el modal.
 * Flujos con hold+cobro y App Driver (TC047 crítico) quedan TODO(MG-178) — validación live.
 * NO se promete verde.
 */

import type { Locator } from '@playwright/test';

import { expect } from '@playwright/test';
import { step } from '@utils/decorators';
import { UiBase } from '@ui/UiBase';

export class CarrierRecurrentTravelPage extends UiBase {
	// Listado de recurrentes (tabs por i18n).
	private get recurringTab(): Locator {
		return this.page.locator('tabset ul li a').filter({ hasText: /recurrente|recurring/i }).first();
	}
	// Modal edición de recurrencia (recurring-edit.component.html).
	private get editStartDate(): Locator {
		return this.page.locator('#datePickerSelected');
	}
	private get recurringValue(): Locator {
		return this.page.locator('#recurringValue');
	}
	private get recurringEnd(): Locator {
		return this.page.locator('#recurringEnd');
	}
	private get paxQty(): Locator {
		return this.page.locator('#paxQty');
	}
	private get saveButton(): Locator {
		// i18n buttons_labels_common.accept = "Aceptar" (recurring-edit.component.html:145).
		return this.page.getByRole('button', { name: /^Aceptar$/i });
	}

	/** Navega al listado de viajes recurrentes del portal carrier (baseURL de la config). */
	@step
	async goto(): Promise<void> {
		await this.page.goto('/#/home/carrier/travel/recurring');
		await this.page.waitForSelector('tabset', { state: 'visible', timeout: 15_000 }).catch(() => {});
	}

	/** Abre la pestaña de recurrentes activos. */
	@step
	async openRecurringTab(): Promise<void> {
		if (await this.recurringTab.count()) {
			await expect(this.recurringTab).toBeVisible({ timeout: 10_000 });
			await this.recurringTab.click();
		}
	}

	/**
	 * Edita fechas de la recurrencia en el modal `app-recurring-edit`.
	 * TODO(MG-178 · REC): confirmar en vivo el disparo del modal desde la fila (icono `fa-pencil`,
	 * `showEditModal`) y la persistencia. TC047 (edición + consistencia + cobro) requiere App Driver.
	 */
	@step
	async editRecurrenceDates(opts: { repeatEvery?: string; endDate?: string; paxQty?: string }): Promise<void> {
		await expect(this.editStartDate).toBeVisible({ timeout: 15_000 });
		if (opts.repeatEvery) await this.recurringValue.fill(opts.repeatEvery);
		if (opts.endDate) await this.recurringEnd.fill(opts.endDate);
		if (opts.paxQty) await this.paxQty.fill(opts.paxQty);
		await this.saveButton.click();
	}
}
