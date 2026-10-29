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

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Regex equivalente a `matchesSearchText` para usar en `locator.filter({ hasText })`: la fila debe
 * contener TODOS los tokens (insensible a mayúsculas, sin importar el orden) de las cadenas dadas.
 * Permite contar las filas coincidentes en el DOM sin recorrerlas a mano ni dormir entre pasadas.
 */
function allTokensRegex(...texts: Array<string | undefined>): RegExp {
	const tokens = normalizeText(texts.filter(Boolean).join(' ')).split(' ').filter(Boolean);
	return new RegExp(`^${tokens.map(token => `(?=[\\s\\S]*${escapeRegExp(token)})`).join('')}`, 'i');
}

/**
 * Anclaje de la fila de un viaje recién creado: lo que devuelve `captureCreatedTravelId`
 * (`travelIdForCarrier` = código WEB "NNNN-W" de la grilla, PREFERIDO; `travelId` = id interno, legacy).
 * Acepta `null` para poder pasar el ref tal cual sin ramificar en el caller.
 */
export interface TripRowAnchor {
	travelIdForCarrier?: number | null;
	travelId?: number | null;
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
		// Acepta "Programados (N)" / "Programmed (N)" o sin contador (UI bilingüe, ver gridSearchBox).
		const scheduledTripsLink = this.page.getByRole('link', { name: /Programados|Programmed|Scheduled/i }).first();
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
			.locator(
				'button.action-btn:has(i.fa-pencil), button[title="Editar"], button[aria-description="Editar"], button[title="Edit"]'
			)
			.first();
		if (await editBtn.count()) {
			await expect(editBtn, 'La fila debe exponer el botón Editar (fa-pencil)').toBeVisible({ timeout: 10_000 });
			await editBtn.click();
			return;
		}

		// Último recurso histórico — EXCLUYE explícitamente el botón destructivo (fa-times/Cancelar),
		// nunca clickear una cancelación como "mejor esfuerzo" de navegación.
		const actionBtn = firstRow
			.getByRole('button')
			.filter({ hasNot: this.page.locator('i.fa-times') })
			.last();
		await expect(actionBtn, 'La fila debe exponer al menos un botón de acción no-destructivo').toBeVisible({
			timeout: 10_000
		});
		await actionBtn.click();
	}

	/** Buscador de la grilla (`input.search-header`). Sólo filtra con el evento Enter (`fill()` solo es no-op). */
	private gridSearchBox(): Locator {
		// Bilingüe (medido en vivo 2026-10-01, carrier 1521 US): la grilla de este carrier renderiza
		// "Search..." y pestañas "Assign / Programmed / Cancelled" aunque el resto del portal esté en
		// español. Con el literal 'Buscar...' el buscador no se encontraba y el filtro degradaba en
		// silencio a "sin filtrar" — la raíz de los falsos "No travel row found" y de los falsos verdes.
		return this.page.getByRole('textbox', { name: /^(Buscar|Search)\.{3}$/ });
	}

	/** Filtra la grilla por el buscador (fill + Enter). No-op si la pestaña activa no expone buscador. */
	private async applyGridSearch(term: string): Promise<void> {
		const search = this.gridSearchBox();
		// Falla cerrado: sin buscador no hay forma de garantizar que la fila evaluada sea la del viaje
		// de esta corrida (paginación + viajes residuales). Antes era un no-op silencioso.
		await expect(
			search,
			'La grilla debe exponer el buscador ("Buscar..." / "Search...") para anclar la fila'
		).toBeVisible({ timeout: 10_000 });
		await search.fill(term);
		await search.press('Enter');
	}

	/**
	 * Término para el buscador cuando NO hay anclaje: el token más largo del pasajero, sin puntuación.
	 * Un solo token funciona igual si el FE filtra por campo o sobre el texto concatenado de la fila
	 * (el orden "apellido, nombre" de la grilla no coincide con el de los datos de prueba); el match
	 * exacto por todos los tokens + destino se aplica después sobre las filas filtradas.
	 */
	private searchTermForPassenger(passenger: string): string {
		const tokens = passenger
			.split(/[\s,]+/)
			.map(token => token.replace(/[^\p{L}\p{N}]/gu, ''))
			.filter(Boolean);
		return tokens.reduce((best, token) => (token.length > best.length ? token : best), tokens[0] ?? passenger);
	}

	/** Filas de la pestaña actual que contienen TODOS los tokens de pasajero (+ destino). */
	private rowsByText(passenger: string, destination?: string): Locator {
		return this.page.locator('tbody tr').filter({ hasText: allTokensRegex(passenger, destination) });
	}

	/**
	 * Filas cuya celda "Código" (primer <td>) muestra `NNNN-W`. Boundary-safe: el carácter previo no puede
	 * ser otro dígito (si no, el código 234 anclaría a la fila "1234-W") y sólo mira esa celda, no
	 * teléfono/fecha/presupuesto (review LOW-1).
	 */
	private rowsByWebCode(travelIdForCarrier: number): Locator {
		return this.page.locator('tbody tr').filter({
			has: this.page
				.locator('td:first-child')
				.filter({ hasText: new RegExp(`(?:^|[^0-9])${travelIdForCarrier}-W`) })
		});
	}

	/**
	 * Resuelve LA fila del viaje en la pestaña actual y exige que sea ÚNICA (nunca `.first()`).
	 *
	 * - Con `travelIdForCarrier`: ancla por el código WEB y filtra la grilla por ese código.
	 * - Con `travelId` (legacy): ancla por el href de detalle (v1.72.8 lo eliminó: no matchea → falla).
	 * - Sin anclaje: filtra la grilla por el pasajero y exige que pasajero + destino coincidan con
	 *   EXACTAMENTE una fila; si hay más, lanza "Coincidencia ambigua" en vez de elegir una (podría ser el
	 *   residuo de una corrida anterior → falso positivo).
	 *
	 * El filtro se RE-EJECUTA en cada intento del `expect.poll` (cada Enter dispara un fetch nuevo; una
	 * fila que migra de estado tras 3DS/hold no aparece en el snapshot inicial). El poll es la única
	 * espera: sin `waitForTimeout`.
	 */
	private async resolveUniqueRow(opts: {
		passenger: string;
		destination?: string;
		travelId?: number | null;
		travelIdForCarrier?: number | null;
	}): Promise<{ row: Locator; label: string }> {
		const { passenger, destination, travelId, travelIdForCarrier } = opts;
		let rows: Locator;
		let label: string;
		let searchTerm: string | null;

		if (travelIdForCarrier != null) {
			rows = this.rowsByWebCode(travelIdForCarrier);
			label = `del viaje ${travelIdForCarrier}-W (anclaje por código WEB)`;
			searchTerm = String(travelIdForCarrier);
		} else if (travelId != null) {
			rows = this.page.locator('tbody tr').filter({ has: this.page.locator(travelDetailHrefSelector(travelId)) });
			label = `del viaje ${travelId} (anclaje por travelId)`;
			searchTerm = null;
		} else {
			rows = this.rowsByText(passenger, destination);
			label = `de "${passenger}"${destination ? ` / "${destination}"` : ''}`;
			searchTerm = this.searchTermForPassenger(passenger);
		}

		let lastCount = 0;
		try {
			await expect
				.poll(
					async () => {
						if (searchTerm) {
							await this.applyGridSearch(searchTerm);
						}
						lastCount = await rows.count();
						return lastCount;
					},
					{
						message: `La fila ${label} debe aparecer UNA sola vez en la pestaña actual (re-fetch por búsqueda — puede tardar en migrar de estado tras 3DS)`,
						timeout: 30_000
					}
				)
				.toBe(1);
		} catch (error) {
			if (lastCount > 1) {
				throw new Error(
					travelIdForCarrier != null || travelId != null
						? `Coincidencia ambigua: ${lastCount} filas para el viaje anclado ${label}`
						: `Coincidencia ambigua: ${lastCount} filas para "${passenger}" / "${destination ?? '(sin destino)'}" — pasar travelIdForCarrier`
				);
			}
			throw error;
		}

		return { row: rows, label };
	}

	/**
	 * Activa la pestaña "Por Asignar". En este FE (Angular, release/v1.72.x) el tablero NO es
	 * Kanban ni expone `data-testid`: es un `<tabset>` de ngx-bootstrap cuya pestaña se identifica
	 * por el heading traducido (`carrier.travels.management.table_tab_to_assign` = "Asignar"). Mismo
	 * patrón que `expectPassengerInEnConflicto`.
	 */
	async openPorAsignarTab(): Promise<void> {
		// Bilingüe + falla cerrado (2026-10-01): con la UI del carrier 1521 en inglés ("Assign") el regex
		// /asignar/i no matcheaba y el `if (count)` dejaba la pestaña activa que estuviera — el oráculo
		// evaluaba OTRA pestaña sin que nada lo delatara.
		const tab = this.page
			.locator('tabset ul li a')
			.filter({ hasText: /asignar|assign/i })
			.first();
		await expect(tab, 'La pestaña "Por asignar" / "Assign" debe existir en Gestión de Viajes').toBeVisible({
			timeout: 10_000
		});
		await tab.click();
		await this.page.waitForSelector('table tbody', { state: 'visible', timeout: 15_000 }).catch(() => {});
	}

	/**
	 * DIAGNÓSTICO: recorre las pestañas de gestión y devuelve el nombre de aquella donde está la fila
	 * del viaje, o `null` si no aparece en ninguna.
	 *
	 * Existe porque "no aparece en Por asignar" tapa dos situaciones OPUESTAS que mandan a investigar
	 * lugares distintos: el viaje cayó en "En conflicto" (se creó y el hold NO se aprobó → hallazgo de
	 * pago, escalar a dev) o no hay fila en ninguna columna (el alta no se completó → causa aguas
	 * arriba, p. ej. tarifa/ruta). El mensaje crudo de la assertion no las distingue, y en la corrida de
	 * TC1011 del 2026-07-28 esa ambigüedad dejó sin respuesta justamente la pregunta que había que
	 * contestar.
	 *
	 * Es READ-ONLY sobre el estado del viaje (sólo cambia de pestaña) y no lanza: está pensado para
	 * usarse dentro del manejo de error de una assertion que ya falló, sin enmascararla.
	 */
	async findTripColumn(passenger: string, destination?: string): Promise<string | null> {
		const tabs = this.page.locator('tabset ul li a');
		const tabCount = await tabs.count();
		const rows = this.rowsByText(passenger, destination);
		const searchTerm = this.searchTermForPassenger(passenger);

		for (let index = 0; index < tabCount; index += 1) {
			const tab = tabs.nth(index);
			const label = ((await tab.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();

			await tab.click({ timeout: 5_000 }).catch(() => undefined);
			await this.page.waitForSelector('table tbody', { state: 'visible', timeout: 5_000 }).catch(() => {});

			// Margen corto por pestaña (poll acotado, sin sleep): la grilla ya está cargada, sólo se re-filtra.
			// Diagnóstico: basta con que EXISTA alguna fila (no exige unicidad).
			const found = await expect
				.poll(
					async () => {
						await this.applyGridSearch(searchTerm);
						return rows.count();
					},
					{ timeout: 2_000 }
				)
				.toBeGreaterThan(0)
				.then(
					() => true,
					() => false
				);

			if (found) {
				return label;
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
	async expectPassengerInPorAsignar(
		passenger: string,
		destination?: string,
		status?: string | RegExp,
		anchor?: TripRowAnchor
	): Promise<void> {
		// La grilla arranca en otra pestaña: sin este click la fila no existe en el DOM.
		await this.openPorAsignarTab();
		await this.expectTripRowInCurrentTab({ passenger, destination, status, ...anchor });
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
	 * preferir `travelIdForCarrier` en código nuevo.
	 *
	 * Sin ninguno de los dos el match es por texto (pasajero + destino) sobre la grilla filtrada por el
	 * buscador, y debe ser ÚNICO: con 2+ filas lanza "Coincidencia ambigua" en vez de tomar una (podría
	 * ser un viaje AJENO de otra corrida con el mismo pasajero/destino — falso positivo, review LOW-1).
	 */
	async expectTripRowInCurrentTab(opts: {
		passenger: string;
		destination?: string;
		status?: string | RegExp;
		travelId?: number | null;
		travelIdForCarrier?: number | null;
	}): Promise<void> {
		const { passenger, destination, status, travelId, travelIdForCarrier } = opts;
		// Filtrar por el buscador de la grilla ANTES de evaluar la fila (fix 2026-08-11, corrida
		// live TC052): las pestañas del carrier compartido acumulan decenas de filas entre corridas
		// (paginadas, "1 de 2" confirmado en vivo con 33 filas) — un `tbody tr` sin filtrar puede no
		// traer la fila recién creada si cae en otra página, aunque exista. El buscador NO filtra con
		// solo `fill()`: exige Enter (confirmado en vivo). La fila se resuelve y se exige ÚNICA en
		// `resolveUniqueRow` (filtro re-ejecutado en cada intento del poll: cada Enter dispara un fetch
		// nuevo, y una fila que migra de estado tras 3DS no aparece en el snapshot inicial).
		// `reactivate()` más abajo tiene el mismo `fill()` sin Enter — no tocado acá, pertenece al
		// bloqueador ya documentado de Cancelados (500 backend).
		const { row, label } = await this.resolveUniqueRow({ passenger, destination, travelId, travelIdForCarrier });
		// Unicidad (count === 1) no implica visibilidad: la fila única debe estar renderizada en la pestaña.
		await expect(row, `La fila ${label} debe estar visible en la pestaña actual`).toBeVisible({ timeout: 10_000 });
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
	async expectPassengerInProgramados(
		passenger: string,
		destination?: string,
		status?: string | RegExp,
		anchor?: TripRowAnchor
	): Promise<void> {
		await this.openScheduledTrips();
		await this.page.waitForSelector('table tbody', { state: 'visible', timeout: 15_000 }).catch(() => {});
		await this.expectTripRowInCurrentTab({ passenger, destination, status, ...anchor });
	}

	/**
	 * Abre la pestaña "Cancelados". Selector verificado por codegen contra TEST v1.72.8: la pestaña
	 * es un `link` cuyo nombre incluye el contador (p.ej. "Cancelados (68)") → match por regex.
	 */
	async openCanceladosTab(): Promise<void> {
		const tab = this.page.getByRole('link', { name: /Cancelados|Cancell?ed/i }).first();
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
						.filter({
							has: this.page.locator('td:first-child').filter({ hasText: `${travelIdForCarrier}-W` })
						})
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
			.locator(
				'button[title="Reactivar Viaje"], button[aria-description="Reactivar Viaje"], button.action-btn-primary:has(i.fa-refresh)'
			)
			.first();
		await expect(reactivateBtn).toBeVisible({ timeout: 10_000 });
		await reactivateBtn.click();
	}

	/**
	 * Verifica el viaje en "En conflicto" con estado "No autorizado" sobre la MISMA fila (anclada si se
	 * pasa `anchor`, única si no — ver `expectTripRowInCurrentTab`).
	 */
	async expectPassengerInEnConflicto(passenger: string, destination?: string, anchor?: TripRowAnchor): Promise<void> {
		const enConflictoTab = this.page
			.locator('tabset ul li a')
			.filter({ hasText: /en conflicto|in conflict/i })
			.first();
		await expect(enConflictoTab, 'La pestaña "En conflicto" / "In Conflict" debe existir').toBeVisible({
			timeout: 10_000
		});
		await enConflictoTab.click();
		await this.page.waitForSelector('table tbody', { state: 'visible', timeout: 15_000 }).catch(() => {});
		await this.expectTripRowInCurrentTab({
			passenger,
			destination,
			status: /No autorizado|NO_AUTORIZADO/i,
			...anchor
		});
	}

	async openDetailForPassenger(passenger: string, destination?: string, anchor?: TripRowAnchor): Promise<void> {
		const { row } = await this.resolveUniqueRow({ passenger, destination, ...anchor });
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
