/**
 * KATA Component (Layer 3) — Carrier · Viajes Recurrentes.
 *
 * Selectores tomados de la fuente real del FE (`magiis-fe`, branch release/v1.72.x — Angular 5 +
 * PrimeNG 6, de ahí las clases `ui-*` del datepicker):
 *   - Alta recurrente — el alta NO tiene endpoint propio: es el MISMO form de alta de viaje
 *     PROGRAMADO con el modal de recurrencia (fuente `add-travel.component.html`):
 *       · botón "Agregar detalles" `.btn-recurrent-trip` (visible sólo con el viaje ya programado:
 *         `!isNow && !recurrigCheck && !flightInfoCheck`, habilitado con cliente elegido);
 *       · modal `formProgramedTravel`: input `#recurringValue` (repetir cada N días), checkboxes
 *         `#monday_checkbox`.. (patrón WEEKLY, no usado acá), `p-calendar formControlName=
 *         "endRecurringTrip"` (fin de la recurrencia, `readonlyInput` + `showIcon`);
 *       · footer: "Aceptar" → `hideProgrammedModal(true); saveDataProgramed()` — habilitado sólo
 *         con (recurringValue>0 || días) && endDate (fuente `disabledProgrammedModal()`).
 *     El POST resultante es el alta normal `carriers/{id}/travels` con `recurringValue` /
 *     `recurringEnd` / `recurringPattern` en el payload (fuente `addTravelcommand.ts` +
 *     BE `TravelService.java` ~1577: crea el RecurringTrip + el travel SCHEDULED en un solo POST).
 *   - Listado: `recurring-list.component.html` (ruta carrier `/#/home/carrier/travel/recurring`;
 *     search `.search-header`; tabs ACTIVE/INACTIVE/CANCELED; filas con `item.passengerName` +
 *     `item.periodicity`).
 *   - Edición de fechas (modal `app-recurring-edit`): `#datePickerSelected`, `#recurringValue`,
 *     `#recurringEnd`, `#paxQty` — usada por TC047 (CASO CRÍTICO), que sigue fixme: su oráculo
 *     (consistencia + finalización) requiere App Driver.
 *
 * FRAGILE / TODO(live): selectores derivados del código FE sin codegen en vivo (mismo estado que
 * `schedulePickupAtLastSlot`, su prerequisito). Validar en la primera corrida contra TEST v1.72.x.
 *
 * Convención KATA: extiende UiBase (usa `this.page`); locators inline; mini-flujo con @atc
 * (área REC → MG-390, mapeo por área aceptado — ver header de los specs); esperas con @step.
 */

import type { Locator } from '@playwright/test';

import { expect } from '@playwright/test';
import { atc, step } from '@utils/decorators';
import { UiBase } from '@ui/UiBase';

export type RecurrenceConfig = {
	/** "Repetir cada N días" (`#recurringValue`). Default 1 — máximo de ocurrencias observables. */
	repeatEveryDays?: number;
	/**
	 * Fin de la recurrencia, en días desde HOY (p-calendar `endRecurringTrip`). Default 2 —
	 * ventana corta a propósito: cada ocurrencia es un viaje SCHEDULED real del pax y una ventana
	 * larga acumula holds/limites (misma economía que documenta `travel-cleanup.ts`).
	 */
	endInDays?: number;
};

export class CarrierRecurrentTravelPage extends UiBase {
	// ── Alta: modal de recurrencia (add-travel.component.html · formProgramedTravel) ──────────

	/** Botón "Agregar detalles" que abre el modal de recurrencia (visible sólo con viaje programado). */
	private get addRecurrenceDetailsButton(): Locator {
		return this.page.locator('.btn-recurrent-trip').first();
	}

	/** Input "Repetir cada" del modal (id estable del FE). */
	private get repeatEveryInput(): Locator {
		return this.page.locator('#recurringValue');
	}

	/** p-calendar del fin de recurrencia (formcontrolname estable; PrimeNG 6 → clases ui-*). */
	private get endRecurringCalendar(): Locator {
		return this.page.locator('p-calendar[formcontrolname="endRecurringTrip"]');
	}

	/** Overlay del datepicker del fin de recurrencia (inline dentro del p-calendar — sin appendTo). */
	private get endRecurringOverlay(): Locator {
		return this.endRecurringCalendar.locator('.ui-datepicker');
	}

	/** Botón Aceptar del FOOTER DEL MODAL (no confundir con el Accept del overlay del p-calendar). */
	private get modalAcceptButton(): Locator {
		return this.page
			.locator('.modal-footer')
			.getByRole('button', { name: /^(Aceptar|Accept)$/i })
			.first();
	}

	/**
	 * Mini-flujo ATC: configura la RECURRENCIA sobre un alta ya PROGRAMADA (prerequisito:
	 * `CarrierNewTravelPage.schedulePickupAtLastSlot()` ya corrió — sin viaje programado el
	 * botón "Agregar detalles" no existe, gate `*ngIf="!isNow && ..."` del FE).
	 *
	 * Abre el modal → "Repetir cada N días" → fin de recurrencia (hoy + endInDays) → Aceptar.
	 * Commit observable doble: el modal se cierra Y el botón "Agregar detalles" DESAPARECE
	 * (el FE lo desmonta cuando `recurrigCheck=true` — el mismo flag que hace que el submit
	 * mande `recurringValue`/`recurringEnd` en el payload).
	 *
	 * @atc MG-390 (área REC — mapeo por área aceptado, ver header de los specs REC; misma
	 * convención que fillMinimum → MG-148 área C).
	 */
	@atc('MG-390', {
		severity: 'critical',
		description: 'Alta recurrente: configurar recurrencia (repetir cada + fecha fin) en el alta programada'
	})
	async configureRecurrence(config: RecurrenceConfig = {}): Promise<void> {
		const repeatEvery = config.repeatEveryDays ?? 1;
		const endInDays = config.endInDays ?? 2;

		await this.openRecurrenceModal();

		// "Repetir cada N días" — input number reactivo sin máscara (fill dispara valueChanges).
		await expect(
			this.repeatEveryInput,
			'El modal de recurrencia debe exponer "Repetir cada" (#recurringValue)'
		).toBeVisible({ timeout: 10_000 });
		await this.repeatEveryInput.fill(String(repeatEvery));
		await expect(this.repeatEveryInput).toHaveValue(String(repeatEvery), { timeout: 5_000 });

		await this.pickEndDate(endInDays);

		// Aceptar del modal: su habilitación ES el oráculo de que el form quedó completo
		// (disabledProgrammedModal exige recurringValue>0 && endDate — fuente FE).
		await expect(
			this.modalAcceptButton,
			'Aceptar debe habilitarse con "Repetir cada" + fecha fin cargados (gate disabledProgrammedModal del FE)'
		).toBeEnabled({ timeout: 10_000 });
		await this.modalAcceptButton.click();

		// Commit: modal cerrado + botón "Agregar detalles" desmontado (recurrigCheck=true en el FE).
		await expect(this.repeatEveryInput).toBeHidden({ timeout: 10_000 });
		await expect(
			this.addRecurrenceDetailsButton,
			'Tras aceptar, el FE debe marcar la recurrencia (recurrigCheck) y desmontar "Agregar detalles" — si sigue visible, la recurrencia NO quedó aplicada al alta'
		).toBeHidden({ timeout: 10_000 });
	}

	/** Abre el modal de recurrencia desde el alta programada ("Agregar detalles"). */
	@step
	async openRecurrenceModal(): Promise<void> {
		await expect(
			this.addRecurrenceDetailsButton,
			'El botón "Agregar detalles" (recurrencia) debe estar visible — requiere el viaje ya PROGRAMADO (schedulePickupAtLastSlot) y cliente elegido'
		).toBeVisible({ timeout: 10_000 });
		await expect(this.addRecurrenceDetailsButton).toBeEnabled({ timeout: 10_000 });
		await this.addRecurrenceDetailsButton.click();
		await expect(this.repeatEveryInput, 'El modal de recurrencia (formProgramedTravel) debe montarse').toBeVisible({
			timeout: 10_000
		});
	}

	/**
	 * Elige la fecha FIN de la recurrencia en el p-calendar (hoy + `daysFromToday`).
	 *
	 * El input es `readonlyInput` → única vía es el overlay: click en el trigger (ícono),
	 * navegar de mes si la fecha objetivo cae en el mes siguiente y click en el día. PrimeNG 6
	 * deshabilita los días < minDate (`recurrentMinDate` = fecha programada) con
	 * `ui-state-disabled`, y los del mes vecino viven en `td.ui-datepicker-other-month` — se
	 * excluyen ambos para clickear el día REAL del mes visible.
	 */
	@step
	async pickEndDate(daysFromToday: number): Promise<void> {
		const target = new Date();
		target.setDate(target.getDate() + daysFromToday);
		const monthsAhead =
			(target.getFullYear() - new Date().getFullYear()) * 12 + (target.getMonth() - new Date().getMonth());

		const trigger = this.endRecurringCalendar
			.locator('button.ui-datepicker-trigger, .ui-datepicker-trigger')
			.first();
		await expect(trigger, 'El p-calendar del fin de recurrencia debe exponer su ícono (showIcon)').toBeVisible({
			timeout: 10_000
		});
		await trigger.click();
		await expect(
			this.endRecurringOverlay,
			'El overlay del datepicker de fin de recurrencia debe abrirse'
		).toBeVisible({ timeout: 10_000 });

		// El alta arranca en el mes actual; la fecha objetivo está a lo sumo en el mes siguiente
		// (ventanas cortas — ver RecurrenceConfig.endInDays).
		for (let hop = 0; hop < monthsAhead; hop++) {
			await this.endRecurringOverlay.locator('.ui-datepicker-next').first().click();
		}

		// El `<a>` del día real trae whitespace de indentación del template alrededor del número
		// (textContent sin trim, p.ej. "\n    13\n    ") — Playwright's `hasText` con RegExp matchea
		// contra el texto CRUDO, no contra una versión trimeada; un `^N$` sin tolerancia de espacios
		// no matchea NUNCA ningún día real (confirmado en vivo: 21 `<a>` habilitados sin filtro,
		// 0 tras el filter con el regex anclado estricto) — de ahí el "element(s) not found" pese a
		// que el día target siempre estuvo presente, habilitado y visible.
		const dayCell = this.endRecurringOverlay
			.locator('td:not(.ui-datepicker-other-month) a.ui-state-default:not(.ui-state-disabled)')
			.filter({ hasText: new RegExp(`^\\s*${target.getDate()}\\s*$`) })
			.first();
		await expect(
			dayCell,
			`El día ${target.getDate()} (hoy + ${daysFromToday}) debe estar habilitado en el datepicker — minDate = fecha programada (recurrentMinDate del FE)`
		).toBeVisible({ timeout: 10_000 });
		await dayCell.click();

		// El overlay del p-calendar trae su propio "Aceptar" en el p-footer (cierra el overlay);
		// PrimeNG puede cerrar solo al elegir el día — por eso el click es condicional.
		const overlayAccept = this.endRecurringOverlay.getByRole('button', { name: /^(Aceptar|Accept)$/i }).first();
		if (await overlayAccept.isVisible().catch(() => false)) {
			await overlayAccept.click();
		}

		// Commit observable: el input readonly del p-calendar refleja una fecha no vacía.
		await expect
			.poll(
				async () =>
					(
						await this.endRecurringCalendar
							.locator('input')
							.first()
							.inputValue()
							.catch(() => '')
					).trim().length,
				{
					message: 'El fin de recurrencia no quedó reflejado en el input del p-calendar tras elegir el día',
					timeout: 10_000
				}
			)
			.toBeGreaterThan(0);
	}

	// ── Listado de recurrentes (recurring-list.component.html) ─────────────────────────────

	/** Buscador del listado (input `.search-header`, dispara `(search)` — Enter). */
	private get listSearchInput(): Locator {
		return this.page.locator('input.search-header');
	}

	/** Navega al listado de viajes recurrentes del portal carrier (baseURL de la config). */
	@step
	async goto(): Promise<void> {
		await this.page.goto('/#/home/carrier/travel/recurring');
		await expect(this.listSearchInput, 'El listado de recurrentes debe montar su buscador').toBeVisible({
			timeout: 15_000
		});
	}

	/** Abre la pestaña de recurrentes activos (primera tab — ACTIVE, default del componente). */
	@step
	async openRecurringTab(): Promise<void> {
		const recurringTab = this.page
			.locator('tabset ul li a')
			.filter({ hasText: /recurrente|recurring/i })
			.first();
		if (await recurringTab.count()) {
			await expect(recurringTab).toBeVisible({ timeout: 10_000 });
			await recurringTab.click();
		}
	}

	/** Filtra el listado por texto (mismo query `find` que consume la API paginated). */
	@step
	async searchInList(query: string): Promise<void> {
		await this.listSearchInput.fill(query);
		// La directiva `search-input` del FE emite (search) — Enter es el gesto del usuario.
		await this.listSearchInput.press('Enter');
	}

	/**
	 * Oráculo del alta recurrente en el LISTADO: existe una fila ACTIVA cuyo pasajero contiene
	 * TODOS los tokens del nombre (el grid muestra `item.passengerName` con formato propio —
	 * 'smith, Emanuel' del dropdown llega como 'Emanuel Smith': match token-based, mismo criterio
	 * que la grilla de gestión) y cuya periodicidad refleja el "Repetir cada" configurado.
	 */
	@step
	async expectRecurrenceListed(passenger: string, repeatEveryDays?: number): Promise<void> {
		const tokens = passenger.split(/[\s,]+/).filter(Boolean);
		let rows = this.page.locator('tbody tr');
		for (const token of tokens) {
			rows = rows.filter({ hasText: new RegExp(token, 'i') });
		}
		const row =
			typeof repeatEveryDays === 'number'
				? rows.filter({ hasText: new RegExp(`\\b${repeatEveryDays}\\b`) })
				: rows;

		await expect(
			row.first(),
			`La recurrencia de "${passenger}"${typeof repeatEveryDays === 'number' ? ` (repetir cada ${repeatEveryDays})` : ''} debe figurar en el listado de recurrentes ACTIVOS`
		).toBeVisible({ timeout: 20_000 });
	}

	// ── Edición de fechas (modal app-recurring-edit) — la consume TC047 (fixme: App Driver) ──

	private get editStartDate(): Locator {
		return this.page.locator('#datePickerSelected');
	}
	private get editRecurringValue(): Locator {
		return this.page.locator('#recurringValue');
	}
	private get editRecurringEnd(): Locator {
		return this.page.locator('#recurringEnd');
	}
	private get editPaxQty(): Locator {
		return this.page.locator('#paxQty');
	}

	/**
	 * Edita fechas de la recurrencia en el modal `app-recurring-edit` (fila → ícono `fa-pencil`).
	 * Lo consume TC047 (CASO CRÍTICO), hoy fixme: su oráculo de consistencia + cobro requiere la
	 * App Driver (APPIUM, Stage 5). TODO(live) cuando se destrabe: confirmar disparo del modal y
	 * persistencia del PUT `carriers/{id}/recurringTrip/{recurringId}/update`.
	 */
	@step
	async editRecurrenceDates(opts: { repeatEvery?: string; endDate?: string; paxQty?: string }): Promise<void> {
		await expect(this.editStartDate).toBeVisible({ timeout: 15_000 });
		if (opts.repeatEvery) await this.editRecurringValue.fill(opts.repeatEvery);
		if (opts.endDate) await this.editRecurringEnd.fill(opts.endDate);
		if (opts.paxQty) await this.editPaxQty.fill(opts.paxQty);
		// i18n buttons_labels_common.accept (recurring-edit.component.html:145).
		await this.page.getByRole('button', { name: /^(Aceptar|Accept)$/i }).click();
	}
}
