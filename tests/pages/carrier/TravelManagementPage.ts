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

/**
 * Selector BOUNDARY-SAFE del link de detalle de un viaje (review LOW-1): un substring plano
 * `a[href*="/travels/12345"]` también matchea los ids 123450..123459 — se exige que después
 * del id venga fin de string, `/` o `?`, así el anclaje nunca toma una fila ajena.
 */
export function travelDetailHrefSelector(travelId: number): string {
	return `a[href$="/travels/${travelId}"], a[href*="/travels/${travelId}/"], a[href*="/travels/${travelId}?"]`;
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

		// Buscar link de detalle primero (href con travelId) — legacy, puede no existir.
		const detailLink = firstRow.locator('a[href*="travelId"], a[href*="/travels/"]').first();
		if (await detailLink.count()) {
			await detailLink.click();
			return;
		}

		// FIX 2026-08-07 (corrida live TC078, 2 iteraciones): el FE reemplazó los anchors de
		// detalle por botones de ícono (fa-pencil/fa-list/fa-times — mismo cambio que ya documenta
		// esta clase para Clonar/Reactivar). El fallback `.last()` anterior tomaba el botón
		// EQUIVOCADO — hoy el último ícono es Cancelar (fa-times), no Edición — y disparaba el
		// popup de cancelación (evidencia: screenshot con el modal "¿Quiere cancelar...?" abierto).
		// `fa-list` navega a `mode=1` (READ-ONLY) — confirmado en vivo (2.º intento): el consumidor
		// (`runScheduledTripCardEdit`) necesita el ABM de EDICIÓN (`mode=3`), que es el ícono
		// fa-pencil ("lápiz de edición", mismo botón que `toggleEditButton` publica para NO_AUTH).
		const editBtn = firstRow
			.locator('button.action-btn:has(i.fa-pencil), button[title="Editar"], button[aria-description="Editar"], button[title="Edit"]')
			.first();
		if (await editBtn.count()) {
			await expect(editBtn, 'La fila debe exponer el botón Editar (fa-pencil)').toBeVisible({ timeout: 10_000 });
			await editBtn.click();
			return;
		}

		// Último recurso histórico — EXCLUYE explícitamente el botón destructivo (fa-times/Cancelar),
		// nunca clickear una cancelación como "mejor esfuerzo" de navegación.
		const actionBtn = firstRow.getByRole('button').filter({ hasNot: this.page.locator('i.fa-times') }).last();
		await expect(actionBtn, 'La fila debe exponer al menos un botón de acción no-destructivo').toBeVisible({ timeout: 10_000 });
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
		await this.expectTripRowInCurrentTab({ passenger, destination, status });
	}

	/**
	 * Verifica la fila del viaje en la PESTAÑA ACTUAL, sin cambiar de pestaña — para callers que
	 * ya navegaron (p.ej. `openScheduledTrips()`). Existe porque `expectPassengerInPorAsignar`
	 * re-clickea "Asignar" por dentro y los oráculos de Programados dependían de que ese locator
	 * silenciosamente NO matchee (review MEDIUM-1) — un rename del FE los mandaba a mirar la
	 * pestaña equivocada sin ningún fallo que lo delate.
	 *
	 * `travelIdForCarrier` (opcional, PREFERIDO) ANCLA la fila por su código WEB visible en la
	 * columna "Código" (grilla, texto "NNNN-W") — mismo idioma que `expectTravelInEnConflicto`
	 * (recovery.helpers.ts). `travelId` (legacy) ancla por `a[href*="/travels/{id}"]`: confirmado
	 * en vivo (recurrentes/, 2026-08-11) que v1.72.8 ELIMINÓ esos anchors de esta grilla — el id
	 * interno del POST tampoco es el código que se muestra, así que este camino nunca matchea.
	 * Se mantiene por compatibilidad con callers que aún no migraron (p.ej. quote-trip-verification);
	 * preferir `travelIdForCarrier` en código nuevo. Sin ninguno de los dos, el match por texto
	 * puede tomar una fila AJENA con el mismo pasajero/destino de otra corrida (review LOW-1).
	 */
	async expectTripRowInCurrentTab(opts: {
		passenger: string;
		destination?: string;
		status?: string | RegExp;
		travelId?: number;
		travelIdForCarrier?: number;
	}): Promise<void> {
		const { passenger, destination, status, travelId, travelIdForCarrier } = opts;
		// Filtrar por el buscador de la grilla ANTES de evaluar la fila (fix 2026-08-11, corrida
		// live TC052): la pestaña "Programados" del carrier compartido acumula decenas de filas
		// entre corridas (paginada, "1 de 2" confirmado en vivo con 33 filas) — un `tbody tr` sin
		// filtrar puede no traer la fila recién creada si cae en otra página, aunque exista
		// (confirmado: 0 matches de "4180" en el snapshot completo del DOM). El buscador
		// (`input.search-header`, mismo control que `CarrierRecurrentTravelPage.searchInList`)
		// NO filtra con solo `fill()` — exige el evento Enter (confirmado en vivo: `fill()` sin
		// Enter deja la grilla intacta; con Enter, filtra a la fila exacta y saca la paginación de
		// la ecuación). `reactivate()` más abajo tiene el mismo `fill()` sin Enter — no tocado acá,
		// pertenece al bloqueador ya documentado de Cancelados (500 backend).
		//
		// RE-EJECUTAR el filtro en cada intento del poll (no solo una vez, fix 2026-08-11, corrida
		// live TC052 variante hold+3DS): cada Enter dispara un fetch nuevo al backend ("Última
		// actualización" visible en la UI) — un solo filtro contra el snapshot inicial no ve una
		// fila cuya escritura backend post-3DS todavía no comitió. Confirmado en vivo: la fila
		// existía en "Asignar" mientras "Programados" reportaba 0 — no es ausencia, es una
		// migración de estado async más lenta que el resto (mismo patrón de latencia extra ya
		// confirmado en el challenge 3DS post-envío).
		const search = this.page.getByRole('textbox', { name: 'Buscar...' });
		const hasSearch = travelIdForCarrier != null && (await search.count()) > 0;
		// Boundary-safe (review LOW-1, mismo criterio que travelDetailHrefSelector): matchear SOLO
		// la celda "Código" (primer <td>), no toda la fila — un `hasText` sin acotar corre contra
		// pasajero/teléfono/fecha/presupuesto también, y una coincidencia de dígitos ajena (p.ej.
		// un teléfono) anclaría a la fila equivocada sin que el test lo note.
		const row =
			travelIdForCarrier != null
				? this.page
						.locator('tbody tr')
						.filter({ has: this.page.locator('td:first-child').filter({ hasText: `${travelIdForCarrier}-W` }) })
						.first()
				: travelId != null
					? this.page
							.locator('tbody tr')
							.filter({ has: this.page.locator(travelDetailHrefSelector(travelId)) })
							.first()
					: await this.tripRow(passenger, destination);
		const anchorLabel =
			travelIdForCarrier != null
				? `del viaje ${travelIdForCarrier}-W (anclaje por código WEB)`
				: travelId != null
					? `del viaje ${travelId} (anclaje por travelId)`
					: `de "${passenger}"`;
		if (hasSearch) {
			await expect
				.poll(
					async () => {
						await search.fill(String(travelIdForCarrier));
						await search.press('Enter');
						await this.page.waitForTimeout(500); // debounce del filtro de la grilla
						return row.count();
					},
					{
						message: `La fila ${anchorLabel} debe estar visible en la pestaña actual (re-fetch por búsqueda — puede tardar en migrar de estado tras 3DS)`,
						timeout: 30_000
					}
				)
				.toBeGreaterThan(0);
		} else {
			await expect(row, `La fila ${anchorLabel} debe estar visible en la pestaña actual`).toBeVisible({
				timeout: travelId != null ? 30_000 : 10_000
			});
		}
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
	 *
	 * `travelIdForCarrier` (opcional, PREFERIDO) ancla por el código WEB visible ("NNNN-W") — mismo
	 * fix que `expectTripRowInCurrentTab` (2026-08-12): el `travelId`/href está muerto desde v1.72.8
	 * y el buscador exige `Enter` explícito (`fill()` solo es no-op, confirmado en vivo). `travelId`
	 * (legacy) se conserva por compatibilidad pero NUNCA matchea en la grilla actual.
	 */
	async reactivate(
		passenger: string,
		destination?: string,
		travelId?: number,
		travelIdForCarrier?: number
	): Promise<void> {
		await this.openCanceladosTab();

		const search = this.page.getByRole('textbox', { name: 'Buscar...' });
		if (await search.count()) {
			await search.fill(travelIdForCarrier != null ? String(travelIdForCarrier) : (destination ?? passenger));
			if (travelIdForCarrier != null) {
				await search.press('Enter');
			}
			await this.page.waitForTimeout(500); // debounce del filtro de la grilla
		}

		// ANCLAJE (fix 2026-08-05 travelId, ampliado 2026-08-12 travelIdForCarrier): la primera
		// coincidencia por texto en el carrier compartido puede ser una fila YA reactivada (el FE
		// oculta su boton Reactivar, `!item.isReactivated`) o un viaje ajeno con el mismo destino
		// canonico -> click no-op y la URL nunca navega al despacho. Boundary-safe (celda "Código"
		// únicamente, mismo criterio que `expectTripRowInCurrentTab`).
		const anchoredRow =
			travelIdForCarrier != null
				? this.page
						.locator('tbody tr')
						.filter({ has: this.page.locator('td:first-child').filter({ hasText: `${travelIdForCarrier}-W` }) })
						.first()
				: travelId != null
					? this.page
							.locator('tbody tr')
							.filter({ has: this.page.locator(travelDetailHrefSelector(travelId)) })
							.first()
					: null;
		if (anchoredRow) {
			await expect(
				anchoredRow,
				travelIdForCarrier != null
					? `La fila del viaje ${travelIdForCarrier}-W debe estar visible en Cancelados (anclaje por código WEB)`
					: `La fila del viaje ${travelId} debe estar visible en Cancelados (anclaje por travelId)`
			).toBeVisible({ timeout: 15_000 });
		}

		// El codegen (PW nuevo) lo grabó como `getByRole('button', { description: 'Reactivar Viaje' })`,
		// opción no soportada en PW 1.56 → equivalente por atributo (tooltip title/aria-description) con
		// fallback al ícono `fa-refresh` confirmado en el FE (robusto a versión y locale).
		const reactivateBtn = (anchoredRow ?? this.page)
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
