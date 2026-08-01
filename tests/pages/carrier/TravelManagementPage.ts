import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { getPortalUrl } from '../../config/gatewayPortalRuntime';

function normalizeText(value: string | null | undefined): string {
	return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function matchesSearchText(candidate: string, searchText: string): boolean {
	const candidateText = normalizeText(candidate);
	const searchTokens = normalizeText(searchText)
		.split(' ')
		.map(token => token.trim())
		.filter(Boolean);

	return searchTokens.every(token => candidateText.includes(token));
}

export class TravelManagementPage {
	constructor(private readonly page: Page) {}

	async goto(): Promise<void> {
		// Detectamos el portal activo desde la URL actual para que este POM funcione
		// tanto en sesiones carrier como contractor sin cambiar el API existente.
		// Si no hay URL cargada aún (about:blank) caemos a carrier como default.
		const currentUrl = this.page.url();
		const portal = currentUrl.includes('/contractor') ? 'contractor' : 'carrier';
		const baseUrl = getPortalUrl('carrier'); // ambos portales comparten el mismo origen
		await this.page.goto(`${baseUrl}/#/home/${portal}/travel/dashboard`);
		// Esperar a que la tabla de viajes cargue desde la API Angular antes de hacer assertions.
		// domcontentloaded es insuficiente para SPA — esperar `tbody` visible da más margen.
		await this.page.waitForSelector('table tbody', { state: 'visible', timeout: 20_000 }).catch(() => {});
	}

	/** Abre la pestaña de viajes programados dentro de gestion de viajes. */
	async openScheduledTrips(): Promise<void> {
		// Acepta "Programados (N)" o "Programados" sin contador.
		const scheduledTripsLink = this.page.getByRole('link', { name: /Programados/i }).first();
		await expect(scheduledTripsLink).toBeVisible({ timeout: 10_000 });
		await scheduledTripsLink.click();
	}

	/** Abre el primer viaje programado visible en la lista. */
	async openFirstScheduledTripDetail(): Promise<void> {
		// Intenta navegar desde la primera fila de datos (tbody tr).
		// Precondición: haber llamado openScheduledTrips() y que exista al menos 1 viaje programado.
		const firstRow = this.page.locator('tbody tr').first();
		await expect(firstRow).toBeVisible({ timeout: 10_000 });

		// Buscar link de detalle primero (href con travelId).
		const detailLink = firstRow.locator('a[href*="travelId"], a[href*="/travels/"]').first();
		if (await detailLink.count()) {
			await detailLink.click();
			return;
		}

		// Último recurso: último botón de la primera fila (patrón de openDetailForPassenger).
		const actionBtn = firstRow.getByRole('button').last();
		await expect(actionBtn).toBeVisible({ timeout: 10_000 });
		await actionBtn.click();
	}

	/**
	 * UNA pasada por las filas visibles. Devuelve `null` si ninguna matchea — no espera ni lanza.
	 * Extraído de `tripRow` para que el escaneo de pestañas de `findTripColumn` pueda usar el MISMO
	 * criterio de match sin heredar su deadline de 30s (7 pestañas × 30s serían 3,5 minutos).
	 */
	private async matchRowOnce(passenger: string, destination?: string): Promise<Locator | null> {
		const rows = this.page.locator('tr');
		const count = await rows.count();

		for (let index = 0; index < count; index += 1) {
			const row = rows.nth(index);
			const text = normalizeText(await row.textContent().catch(() => ''));

			if (!matchesSearchText(text, passenger)) {
				continue;
			}

			if (destination && !matchesSearchText(text, destination)) {
				continue;
			}

			return row;
		}

		return null;
	}

	private async tripRow(passenger: string, destination?: string) {
		const deadline = Date.now() + 30_000;

		while (Date.now() < deadline) {
			const row = await this.matchRowOnce(passenger, destination);

			if (row) {
				return row;
			}

			await this.page.waitForTimeout(500);
		}

		throw new Error(
			`No travel row found for passenger "${passenger}"${destination ? ` and destination "${destination}"` : ''}`
		);
	}

	/**
	 * Activa la pestaña "Por Asignar". En este FE (Angular, release/v1.72.x) el tablero NO es
	 * Kanban ni expone `data-testid`: es un `<tabset>` de ngx-bootstrap cuya pestaña se identifica
	 * por el heading traducido (`carrier.travels.management.table_tab_to_assign` = "Asignar"). Mismo
	 * patrón que `expectPassengerInEnConflicto`.
	 */
	async openPorAsignarTab(): Promise<void> {
		const tab = this.page.locator('tabset ul li a').filter({ hasText: /asignar/i }).first();
		if (await tab.count()) {
			await expect(tab).toBeVisible({ timeout: 10_000 });
			await tab.click();
			await this.page.waitForSelector('table tbody', { state: 'visible', timeout: 15_000 }).catch(() => {});
		}
	}

	/**
	 * DIAGNÓSTICO: recorre las pestañas de gestión y devuelve el nombre de aquella donde está la fila
	 * del viaje, o `null` si no aparece en ninguna.
	 *
	 * Existe porque "no aparece en Por asignar" tapa dos situaciones OPUESTAS que mandan a investigar
	 * lugares distintos: el viaje cayó en "En conflicto" (se creó y el hold NO se aprobó → hallazgo de
	 * pago, escalar a dev) o no hay fila en ninguna columna (el alta no se completó → causa aguas
	 * arriba, p. ej. tarifa/ruta). El mensaje crudo de `tripRow` no las distingue, y en la corrida de
	 * TC1011 del 2026-07-28 esa ambigüedad dejó sin respuesta justamente la pregunta que había que
	 * contestar.
	 *
	 * Es READ-ONLY sobre el estado del viaje (sólo cambia de pestaña) y no lanza: está pensado para
	 * usarse dentro del manejo de error de una assertion que ya falló, sin enmascararla.
	 */
	async findTripColumn(passenger: string, destination?: string): Promise<string | null> {
		const tabs = this.page.locator('tabset ul li a');
		const tabCount = await tabs.count();

		for (let index = 0; index < tabCount; index += 1) {
			const tab = tabs.nth(index);
			const label = ((await tab.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();

			await tab.click({ timeout: 5_000 }).catch(() => undefined);
			await this.page.waitForSelector('table tbody', { state: 'visible', timeout: 5_000 }).catch(() => {});

			// Margen corto por pestaña: la grilla ya está cargada, sólo se re-renderiza el filtro.
			const deadline = Date.now() + 2_000;

			while (Date.now() < deadline) {
				if (await this.matchRowOnce(passenger, destination)) {
					return label;
				}

				await this.page.waitForTimeout(250);
			}
		}

		return null;
	}

	/**
	 * Tabla de viajes de la pestaña activa. Antes usaba `getByTestId('column-por-asignar')`, un
	 * testid que NO existe en el FE → el locator nunca matcheaba. El tablero comparte una única
	 * `<table>` cuyo contenido cambia según la pestaña seleccionada (no hay columnas Kanban).
	 */
	porAsignarColumn() {
		return this.page.locator('table.table, table').first();
	}

	/**
	 * `status` acepta RegExp: el estado de la fila NO es determinista después de un hold aprobado.
	 * Si ningún driver tomó el viaje queda en "Buscando chofer"; si un driver YA lo aceptó pasa a
	 * "En progreso" — ambos son resultados válidos del hold (confirmado por el líder de QA,
	 * 2026-07-27, con pago exitoso desde la App Driver). Pasar un literal fijo introduce una
	 * condición de carrera que hace fallar el test por una razón que no es un bug.
	 */
	async expectPassengerInPorAsignar(passenger: string, destination?: string, status?: string | RegExp): Promise<void> {
		// La grilla arranca en otra pestaña: sin este click la fila no existe en el DOM.
		await this.openPorAsignarTab();
		const row = await this.tripRow(passenger, destination);
		await expect(row).toBeVisible({ timeout: 10_000 });
		await expect
			.poll(
				async () => {
					const text = normalizeText(await row.textContent().catch(() => ''));
					return matchesSearchText(text, passenger) && (!destination || matchesSearchText(text, destination));
				},
				{ timeout: 10_000 }
			)
			.toBe(true);

		if (status) {
			await expect(row).toContainText(status, { timeout: 10_000 });
		}
	}

	/**
	 * Oráculo del viaje PROGRAMADO (alta con hora futura): NO cae en "Por asignar" sino en la pestaña
	 * "Programados". Mismo patrón que `expectPassengerInEnConflicto` — hay que cambiar de pestaña
	 * primero porque la grilla arranca en otra y la fila no existe en el DOM hasta el click.
	 *
	 * `status` acepta RegExp por la misma razón que `expectPassengerInPorAsignar`: el estado de la fila
	 * de un programado depende de si ya se le asignó conductor, y fijar un literal introduce una
	 * condición de carrera.
	 */
	async expectPassengerInProgramados(passenger: string, destination?: string, status?: string | RegExp): Promise<void> {
		await this.openScheduledTrips();
		await this.page.waitForSelector('table tbody', { state: 'visible', timeout: 15_000 }).catch(() => {});
		const row = await this.tripRow(passenger, destination);
		await expect(row).toBeVisible({ timeout: 10_000 });

		if (status) {
			await expect(row).toContainText(status, { timeout: 10_000 });
		}
	}

	/**
	 * Abre la pestaña "Cancelados". Selector verificado por codegen contra TEST v1.72.8: la pestaña
	 * es un `link` cuyo nombre incluye el contador (p.ej. "Cancelados (68)") → match por regex.
	 */
	async openCanceladosTab(): Promise<void> {
		const tab = this.page.getByRole('link', { name: /Cancelados/i }).first();
		await expect(tab).toBeVisible({ timeout: 10_000 });
		await tab.click();
		await this.page.waitForSelector('table tbody', { state: 'visible', timeout: 15_000 }).catch(() => {});
	}

	/**
	 * Reactiva un viaje cancelado (pestaña Cancelados → filtrar → botón Reactivar).
	 * Locators verificados por codegen contra TEST v1.72.8: buscador `textbox "Buscar..."` para aislar
	 * la fila y botón `Reactivar Viaje` (tooltip → `getByRole('button', { description })`). FE:
	 * `cloneTravel(travelId)` = API + navegación a `listDriverOnline`.
	 * Nota: tras filtrar se reactiva la primera coincidencia (el viaje recién cancelado suele ser el más reciente).
	 */
	async reactivate(passenger: string, destination?: string): Promise<void> {
		await this.openCanceladosTab();

		const search = this.page.getByRole('textbox', { name: 'Buscar...' });
		if (await search.count()) {
			await search.fill(destination ?? passenger);
			await this.page.waitForTimeout(500); // debounce del filtro de la grilla
		}

		// El codegen (PW nuevo) lo grabó como `getByRole('button', { description: 'Reactivar Viaje' })`,
		// opción no soportada en PW 1.56 → equivalente por atributo (tooltip title/aria-description) con
		// fallback al ícono `fa-refresh` confirmado en el FE (robusto a versión y locale).
		const reactivateBtn = this.page
			.locator('button[title="Reactivar Viaje"], button[aria-description="Reactivar Viaje"], button.action-btn-primary:has(i.fa-refresh)')
			.first();
		await expect(reactivateBtn).toBeVisible({ timeout: 10_000 });
		await reactivateBtn.click();
	}

	async expectPassengerInEnConflicto(passenger: string, destination?: string): Promise<void> {
		const enConflictoTab = this.page
			.locator('tabset ul li a')
			.filter({ hasText: /en conflicto/i })
			.first();
		await expect(enConflictoTab).toBeVisible({ timeout: 10_000 });
		await enConflictoTab.click();
		await this.page.waitForSelector('table tbody', { state: 'visible', timeout: 15_000 }).catch(() => {});
		const row = await this.tripRow(passenger, destination);
		await expect(row).toBeVisible({ timeout: 10_000 });
		await expect(row).toContainText(/No autorizado|NO_AUTORIZADO/i, { timeout: 10_000 });
	}

	async openDetailForPassenger(passenger: string, destination?: string): Promise<void> {
		const row = await this.tripRow(passenger, destination);
		await expect(row).toBeVisible({ timeout: 10_000 });
		const detailLink = row.locator('a[href*="/travels/"]').first();

		if (await detailLink.count()) {
			await expect(detailLink).toBeVisible({ timeout: 10_000 });
			await detailLink.click();
			return;
		}

		const actionButtons = row.getByRole('button');

		if (await actionButtons.count()) {
			const target = actionButtons.last();
			await expect(target).toBeVisible({ timeout: 10_000 });
			await target.click();
			return;
		}

		await row.locator('.action-btn.color-gray').first().click();
	}
}
