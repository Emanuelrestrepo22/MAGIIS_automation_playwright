import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../../../pages/shared/BasePage';

/**
 * FlightInfoModal — POM propio de la feature `flights`.
 *
 * Modela el modal "Información de Vuelo" del alta/edición de viaje (Carrier V1): se abre con
 * el botón de vuelo cuando el destino es un aeropuerto, permite buscar una aerolínea y
 * seleccionar un vuelo del listado; también cubre eliminar el vuelo asociado desde el detalle.
 * Los datos de vuelo vienen de FlightAware AeroAPI vía `getFlights` (ver ATP MX-6120 + memoria
 * magiis-getflights-aeroapi).
 *
 * Extiende `BasePage` (sustrato compartido, Fase A) para reusar las primitivas de widgets
 * Angular V1 — aquí `waitForLoadingOverlayToDisappear` tras Aceptar.
 *
 * Locators derivados de los recordings de codegen (`../recorded/alta-viaje-con-vuelo.recorded.ts`
 * y `../recorded/editar-vuelo-desde-detalle.recorded.ts`) y CORREGIDOS contra UAT (v1.72.6,
 * 2026-07-14): el listado de vuelos son cards `.card-flight` (no una `<table>`); la selección
 * es un SINGLE click sobre la card (agrega `tr-select` → habilita Aceptar), NO un dblclick.
 */
export class FlightInfoModal extends BasePage {
	private readonly flightRoundButton: Locator;
	private readonly modalHeading: Locator;
	private readonly airlineSelect: Locator;
	private readonly airlineSearchInput: Locator;
	private readonly searchButton: Locator;
	private readonly acceptButtons: Locator;
	private readonly deleteFlightButton: Locator;
	private readonly flightNumberInput: Locator;
	private readonly manualEntryButton: Locator;
	private readonly noResultsMessage: Locator;

	constructor(page: Page) {
		super(page);
		this.flightRoundButton = page.locator('.btn.btn-primary.rounded-btn.btn-flight-round');
		this.modalHeading = page.getByRole('heading', { name: 'Información de Vuelo' });
		this.airlineSelect = page.getByText('Seleccione Aerolínea');
		this.airlineSearchInput = page.getByRole('textbox', { name: 'Aerolínea a buscar' });
		this.searchButton = page.getByRole('button', { name: 'Buscar' });
		// Coexisten varios botones "Aceptar" en el DOM (modales Angular ocultos: Notas, Otro Costo,
		// Pasajero); solo el del modal de vuelo es visible. Se resuelve el visible+enabled en accept().
		this.acceptButtons = page.getByRole('button', { name: 'Aceptar' });
		// El botón papelera es un icon-button. Dos variantes según contexto (confirmado UAT v1.72.6):
		//  - DETALLE: tooltip "Eliminar vuelo" en title/aria-label/aria-description.
		//  - ALTA (post-vinculación): icon-button SIN title, dentro de `div.flight-trip-delete`
		//    (wrapper específico de la card del vuelo) → se materializa al hacer hover sobre la card.
		//    Se scopea a `flight-trip-delete` para no colisionar con los `fic-remove-external`
		//    ocultos de nota/otro-costo/pax. Ver deleteAssociatedFlight() para el hover-reveal.
		this.deleteFlightButton = page.locator('button[title="Eliminar vuelo"], button[aria-label="Eliminar vuelo"], button[aria-description="Eliminar vuelo"], div.flight-trip-delete button').first();
		this.flightNumberInput = page.getByRole('textbox', { name: 'Número de Vuelo:' });
		// "Ingreso Manual" aparece cuando getFlights devuelve 200 [] (sin resultados) — validado UAT.
		this.manualEntryButton = page.getByRole('button', { name: /Ingreso Manual/i });
		this.noResultsMessage = page.getByText(/No se encontraron vuelos/i);
	}

	/** Abre el modal desde el botón de vuelo del formulario (requiere destino = aeropuerto). */
	async open(): Promise<void> {
		await expect(this.flightRoundButton).toBeVisible({ timeout: 10_000 });
		await this.flightRoundButton.click();
		await expect(this.modalHeading).toBeVisible({ timeout: 10_000 });
	}

	/**
	 * Selecciona la aerolínea (autocomplete Angular) y dispara la búsqueda de vuelos.
	 * El input dispara un debounce: se teclea con `pressSequentially` (no `fill`) y se espera
	 * a que la opción aparezca antes de clickearla, si no el listado no se refresca (BL-012).
	 */
	async searchAirline(query: string, optionLabel: string): Promise<void> {
		await this.airlineSelect.click();
		await this.airlineSearchInput.click();
		await this.airlineSearchInput.pressSequentially(query, { delay: 110 });
		const option = this.page.getByText(optionLabel);
		await expect(option).toBeVisible({ timeout: 10_000 });
		await option.click();
		await expect(this.searchButton).toBeEnabled({ timeout: 10_000 });
		await this.searchButton.click();
	}

	/**
	 * Selecciona un vuelo del listado por su etiqueta (ej. "AR1132 - Aerolíneas Argentinas").
	 * El listado son cards `.card-flight`: un SINGLE click sobre la card la marca (`tr-select`)
	 * y habilita Aceptar (validado contra UAT v1.72.6 — un dblclick solo selecciona texto).
	 */
	async selectFlightByLabel(label: string | RegExp): Promise<void> {
		// Esperar a que el listado de resultados esté renderizado antes de filtrar/clickear
		// (getFlights + render progresivo — evita clickear una card que aún no está estable).
		await expect(this.page.locator('.card-flight').first()).toBeVisible({ timeout: 15_000 });
		const card = this.page.locator('.card-flight').filter({ hasText: label }).first();
		await expect(card).toBeVisible({ timeout: 10_000 });
		await card.scrollIntoViewIfNeeded();
		// Click con reintento hasta que la card quede marcada (`tr-select`): en el runner el primer
		// click a veces no prende si el render aún no asentó (validado UAT — el click SÍ marca).
		await expect
			.poll(
				async () => {
					const selected = await card.evaluate(el => el.className.includes('tr-select')).catch(() => false);
					if (!selected) await card.click().catch(() => undefined);
					return card.evaluate(el => el.className.includes('tr-select')).catch(() => false);
				},
				{ timeout: 15_000, message: 'esperando tr-select en la card de vuelo tras el click' }
			)
			.toBe(true);
	}

	/**
	 * Confirma la asociación del vuelo. Resuelve el Aceptar VISIBLE + habilitado (hay varios
	 * "Aceptar" ocultos de otros modales Angular en el DOM) y espera a que el overlay desaparezca.
	 */
	async accept(): Promise<void> {
		const count = await this.acceptButtons.count();
		for (let i = 0; i < count; i++) {
			const btn = this.acceptButtons.nth(i);
			if ((await btn.isVisible()) && (await btn.isEnabled())) {
				await btn.click();
				await this.waitForLoadingOverlayToDisappear();
				return;
			}
		}
		throw new Error('FlightInfoModal.accept(): no visible+enabled "Aceptar" button found');
	}

	/**
	 * Elimina el vuelo asociado desde el detalle de viaje (botón papelera "Eliminar vuelo").
	 * Tras esto el flujo de edición suele requerir Recalcular + Guardar (ver TravelDetailPage).
	 */
	async deleteAssociatedFlight(): Promise<void> {
		// En el ALTA la papelera vive en `div.flight-trip-delete` dentro de la card del vuelo
		// (`div.row` que contiene el delete) y se materializa al hacer HOVER sobre la card.
		// Hover al contenedor antes de clickear; en DETALLE (title="Eliminar vuelo") el hover es
		// un no-op inocuo si la estructura no existe. Ver discovery UAT 2026-07-16.
		const flightCard = this.page.locator('div.row', { has: this.page.locator('div.flight-trip-delete') }).first();
		if (await flightCard.count()) {
			await flightCard.scrollIntoViewIfNeeded().catch(() => undefined);
			await flightCard.hover().catch(() => undefined);
		}
		await expect(this.deleteFlightButton).toBeVisible({ timeout: 10_000 });
		await this.deleteFlightButton.click();
		await this.waitForLoadingOverlayToDisappear();
	}

	/**
	 * TC17 — Busca por una aerolínea + un número de vuelo INEXISTENTE y espera que getFlights
	 * devuelva 200 `[]`: el modal muestra "No se encontraron vuelos" y ofrece el botón "Ingreso
	 * Manual" (validado contra UAT v1.72.6). El resultado vacío es un 200 normal, no un error.
	 */
	async searchExpectingNoResults(airlineQuery: string, airlineOptionLabel: string, missingFlightNumber: string): Promise<void> {
		await this.airlineSelect.click();
		await this.airlineSearchInput.click();
		await this.airlineSearchInput.pressSequentially(airlineQuery, { delay: 110 });
		const option = this.page.getByText(airlineOptionLabel);
		await expect(option).toBeVisible({ timeout: 10_000 });
		await option.click();
		await this.flightNumberInput.fill(missingFlightNumber);
		await expect(this.searchButton).toBeEnabled({ timeout: 10_000 });
		await this.searchButton.click();
		await expect(this.noResultsMessage).toBeVisible({ timeout: 15_000 });
		await expect(this.manualEntryButton).toBeVisible({ timeout: 10_000 });
	}

	/** Cambia el modal a modo de ingreso MANUAL de vuelo (botón "Ingreso Manual"). */
	async enterManualMode(): Promise<void> {
		await expect(this.manualEntryButton).toBeVisible({ timeout: 10_000 });
		await this.manualEntryButton.click();
	}

	/** Escribe el número de vuelo (modo manual). */
	async setFlightNumber(value: string): Promise<void> {
		await this.flightNumberInput.click();
		await this.flightNumberInput.fill(value);
	}

	/**
	 * Marca la dirección del vuelo (Partidas → radio `depart`, Arribos → radio `arrival`).
	 * Requiere click REAL sobre el label (`force`) — eventos sintéticos no registran en la zona
	 * Angular (validado UAT v1.72.6).
	 */
	async selectDirection(direction: 'Partidas' | 'Arribos'): Promise<void> {
		const radioId = direction === 'Partidas' ? 'depart' : 'arrival';
		await this.page.locator(`label[for="${radioId}"]`).first().click({ force: true });
	}

	/**
	 * Devuelve si el botón "Aceptar" VISIBLE del modal está habilitado (TC10 — tabla de decisión
	 * del binding `disabled`). Hay varios "Aceptar" ocultos en el DOM: se evalúa solo el visible.
	 */
	async isAcceptEnabled(): Promise<boolean> {
		const count = await this.acceptButtons.count();
		for (let i = 0; i < count; i++) {
			const btn = this.acceptButtons.nth(i);
			if (await btn.isVisible()) {
				return btn.isEnabled();
			}
		}
		return false;
	}

	/**
	 * Lee la fecha/hora que muestra el modal "Información de Vuelo" (`departReturnSchedule`,
	 * formato dd/MM/yyyy HH:mm). Prioriza el input datetime del modal; si no, extrae el patrón
	 * dd/MM/yyyy del cuerpo del modal.
	 * NOTE(verify-uat): confirmar el selector del input de fecha del modal en la 1ª corrida verde.
	 */
	async getFlightDate(): Promise<string> {
		const input = this.page.locator('.modal input[type="datetime-local"], .modal .inputs-programmed input, ngb-modal-window input[type="datetime-local"]').first();
		const val = await input.inputValue().catch(() => '');
		if (val) return val;
		const body = await this.page
			.locator('.modal-body, ngb-modal-window .modal-body')
			.first()
			.innerText()
			.catch(() => '');
		const m = body.match(/(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?)/);
		return m ? m[1] : body.trim();
	}

	/**
	 * VA-4 — regresión del bug "fecha del modal" (MX-5826, fixeado + validado manual en v1.72.6):
	 * al abrir el modal desde el detalle/edición, la fecha debe reflejar la del VIAJE PROGRAMADO,
	 * NO la fecha actual ni la del día anterior.
	 * @param expectedTripDate fragmento dd/MM/yyyy de la fecha del viaje programado.
	 */
	async expectFlightDateMatchesTrip(expectedTripDate: string): Promise<void> {
		const shown = await this.getFlightDate();
		expect(shown, `el modal abrió con "${shown}"; se esperaba la fecha del viaje "${expectedTripDate}" (regresión bug fecha-modal)`).toContain(expectedTripDate);
	}
}
