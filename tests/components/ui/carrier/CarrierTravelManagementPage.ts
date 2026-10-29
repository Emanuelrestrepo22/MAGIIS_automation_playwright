/**
 * KATA Component (Layer 3) — Carrier · Gestión de Viajes.
 *
 * Versión KATA del POM `tests/pages/carrier/TravelManagementPage.ts`: extiende `UiBase`
 * y expone el subconjunto que consumen los specs de hold. Compone el POM legacy
 * internamente (delegación); el POM legacy queda intacto para specs aún no amoldados.
 *
 * NOTA @atc — MAPEO POR ÁREA (aceptado): el idmap `atp-mg-gateway-idmap.md` es
 * API-level. La verificación de que el viaje quedó en "Por Asignar" (hold aprobado)
 * se mapea al MG más cercano del área E (Hold): MG-158 (TC-PAY-E-01). Reasignar cuando
 * el ATP tenga TCs UI de hold.
 *
 * Convención KATA aplicada:
 *   - Extiende UiBase.
 *   - Import por alias (@pages), sin relativos nuevos.
 *   - Verificación de hold decorada con @atc; navegación trazada con @step.
 */

import type { Locator } from '@playwright/test';
import type { TestContextOptions } from '@TestContext';

import { expect } from '@playwright/test';
import { TravelManagementPage as LegacyTravelManagementPage, travelDetailHrefSelector } from '@pages/carrier';
import { atc, step } from '@utils/decorators';
import { UiBase } from '@ui/UiBase';

/** Pestañas de gestión desde las que el FE publica el botón Clonar (`shouldShowTravelClone`: tabs 2/5/6). */
export type CloneSourceTab = 'programados' | 'cancelados' | 'finalizados';

export class CarrierTravelManagementPage extends UiBase {
	private readonly legacy: LegacyTravelManagementPage;

	constructor(options: TestContextOptions) {
		super(options);
		this.legacy = new LegacyTravelManagementPage(this.page);
	}

	/** Navega a Gestión de Viajes y espera la tabla. */
	@step
	async goto(): Promise<void> {
		await this.legacy.goto();
	}

	/** Abre la pestaña "Programados" dentro de Gestión de Viajes. */
	@step
	async openScheduledTrips(): Promise<void> {
		await this.legacy.openScheduledTrips();
	}

	/** Abre el detalle del primer viaje programado visible. */
	@step
	async openFirstScheduledTripDetail(): Promise<void> {
		await this.legacy.openFirstScheduledTripDetail();
	}

	/**
	 * Mini-flujo ATC de verificación: confirma que el viaje del pasajero quedó en la
	 * columna "Por Asignar" (hold aprobado / Stripe pre-autorizó). @atc MG-158 (área E —
	 * pendiente reasignar).
	 */
	@atc('MG-158', { severity: 'critical', description: 'Verificar viaje en "Por Asignar" tras hold aprobado' })
	async expectPassengerInPorAsignar(
		passenger: string,
		destination?: string,
		status?: string | RegExp
	): Promise<void> {
		await this.legacy.expectPassengerInPorAsignar(passenger, destination, status);
	}

	/**
	 * Verifica la fila del viaje en la PESTAÑA ACTUAL (sin re-clickear "Asignar" por dentro) —
	 * para oráculos que ya navegaron con `openScheduledTrips()` u otra pestaña (review MEDIUM-1).
	 * `travelId` ancla la fila por su link de detalle (boundary-safe, review LOW-1).
	 *
	 * Sin decorar con @atc: no hay key del ATP para esta verificación genérica de pestaña y las
	 * keys jamás se inventan (mismo criterio que `expectPassengerInEnConflicto`).
	 */
	@step
	async expectTripRowInCurrentTab(opts: {
		passenger: string;
		destination?: string;
		status?: string | RegExp;
		travelId?: number;
		travelIdForCarrier?: number;
	}): Promise<void> {
		await this.legacy.expectTripRowInCurrentTab(opts);
	}

	/**
	 * Mini-flujo ATC: reactiva un viaje cancelado (pestaña Cancelados → botón reactivar). @atc MG-440
	 * (área REACT — pendiente reasignar; idmap API-level sin 1:1 con TS-STRIPE-P2-TC060).
	 */
	@atc('MG-440', { severity: 'normal', description: 'Reactivar viaje cancelado desde Gestión de Viajes' })
	async reactivate(
		passenger: string,
		destination?: string,
		travelId?: number,
		travelIdForCarrier?: number
	): Promise<void> {
		await this.legacy.reactivate(passenger, destination, travelId, travelIdForCarrier);
	}

	/**
	 * Contraparte del oraculo para el viaje PROGRAMADO: con hora futura el viaje NO entra en "Por
	 * asignar" sino en la pestana "Programados", y ahi espera hasta su horario. Verificado en las dos
	 * grabaciones eBizCharge del 2026-07-30 (alta programada desde carrier y desde el widget Quote,
	 * donde la pestana mostro "Programados (1)").
	 *
	 * Sin decorar con @atc: la matriz tiene el caso (`TS-EBIZ-TC1261`) pero el ATP no tiene key para
	 * la verificacion UI de un alta programada, y las keys jamas se inventan. Queda unmapped-visible.
	 */
	@step
	async expectPassengerInProgramados(
		passenger: string,
		destination?: string,
		status?: string | RegExp
	): Promise<void> {
		await this.legacy.expectPassengerInProgramados(passenger, destination, status);
	}

	/**
	 * Contraparte UNHAPPY: confirma que el viaje quedó en "En conflicto" con estado "No autorizado"
	 * — el hold del viaje falló DESPUÉS de vincular la tarjeta, así que el viaje existe y queda
	 * marcado (desenlace `trip-unauthorized` de `journey-outcome.ts`).
	 *
	 * Sin decorar con @atc: no hay key del ATP para la verificación UI del hold fallido y las keys
	 * jamás se inventan. Queda unmapped-visible hasta que el ATP tenga el TC correspondiente.
	 */
	@step
	async expectPassengerInEnConflicto(passenger: string, destination?: string): Promise<void> {
		await this.legacy.expectPassengerInEnConflicto(passenger, destination);
	}

	/**
	 * DIAGNÓSTICO read-only: en qué pestaña de gestión está el viaje, o `null` si en ninguna.
	 * Para usar dentro del manejo de error de una assertion que ya falló — ver el JSDoc del método
	 * legacy, que explica las dos situaciones opuestas que distingue.
	 */
	@step
	async findTripColumn(passenger: string, destination?: string): Promise<string | null> {
		return this.legacy.findTripColumn(passenger, destination);
	}

	/** Abre la pestaña "Cancelados" (delegación al POM legacy — selector verificado por codegen). */
	@step
	async openCanceladosTab(): Promise<void> {
		await this.legacy.openCanceladosTab();
	}

	/**
	 * Abre la pestaña "Finalizados" de Gestión de Viajes.
	 *
	 * Mismo patrón que `openCanceladosTab` del POM legacy (link cuyo nombre incluye el contador,
	 * p.ej. "Finalizados (25)"). Textos confirmados en el FE (`magiis-fe` i18n:
	 * `table_tab_done` = "Finalizados" / "Finalized"). TODO(live): validar contra TEST — el patrón
	 * está codegen-verificado para Cancelados, no para esta pestaña.
	 */
	@step
	async openFinalizadosTab(): Promise<void> {
		const tab = this.page.getByRole('link', { name: /Finalizados|Finalized/i }).first();
		await expect(tab).toBeVisible({ timeout: 10_000 });
		await tab.click();
		await this.page.waitForSelector('table tbody', { state: 'visible', timeout: 15_000 }).catch(() => {});
	}

	/**
	 * Mini-flujo ATC: clona un viaje desde Gestión de Viajes (pestaña origen → filtrar →
	 * botón Clonar de la fila) y verifica la navegación al formulario de alta PRECARGADO
	 * (`/#/home/carrier/travel/create?travelId=<id>`). @atc MG-428 (área CLON — pendiente
	 * reasignar; idmap API-level sin 1:1 con TS-STRIPE-P2-TC066..077).
	 *
	 * Ingeniería inversa del FE (`travel-dashboard.component`): el botón Clonar (ícono
	 * `fa-files-o`, tooltip `buttons_labels_common.clone` = "Clonar"/"Clone") se publica en las
	 * pestañas Programados/Cancelados/Finalizados (`shouldShowTravelClone`: selectedTabIdx 2/5/6)
	 * y ejecuta `gotToClone(travelId)` → navega a `travelCreate` con queryParam `travelId`.
	 * NO confundir con el botón Reactivar (`fa-refresh`, llama a la API `cloneTravel` y despacha).
	 *
	 * FRAGILE: locators derivados del código FE (no de codegen live) — TODO(live): validar el
	 * ícono/tooltip contra TEST v1.72.x en la primera corrida.
	 *
	 * @param searchText texto para el buscador de la grilla (aísla la fila; usar destino corto).
	 * @param from pestaña origen del clonado.
	 * @param travelId legacy — ancla por `href`, MUERTO desde v1.72.8 (ver `travelIdForCarrier`).
	 * @param travelIdForCarrier PREFERIDO — ancla por el código WEB visible ("NNNN-W"), mismo fix
	 *   2026-08-12 que `TravelManagementPage.reactivate()`/`expectTripRowInCurrentTab`. Cuando se
	 *   provee, se usa como query del buscador (con `Enter` explícito — `fill()` solo es no-op).
	 */
	@atc('MG-428', {
		severity: 'normal',
		description: 'Clonar viaje desde Gestión de Viajes (form de alta precargado)'
	})
	async cloneTravel(
		searchText: string,
		from: CloneSourceTab,
		travelId?: number,
		travelIdForCarrier?: number
	): Promise<void> {
		if (from === 'cancelados') {
			await this.legacy.openCanceladosTab();
		} else if (from === 'finalizados') {
			await this.openFinalizadosTab();
		} else {
			await this.legacy.openScheduledTrips();
		}

		// Filtrado de la grilla: mismo buscador que usa `legacy.reactivate` (codegen TEST v1.72.8).
		// Bilingüe por la convención BL-048 (el portal puede quedar en EN en sesiones manuales).
		const search = this.page.getByRole('textbox', { name: /Buscar\.\.\.|Search\.\.\./i }).first();
		if (await search.count()) {
			await search.fill(travelIdForCarrier != null ? String(travelIdForCarrier) : searchText);
			if (travelIdForCarrier != null) {
				await search.press('Enter');
			}
		}

		// La fila objetivo debe quedar visible tras el filtro (reemplaza el sleep de debounce del
		// POM legacy por una espera observable — lint `playwright/no-wait-for-timeout`).
		// ANCLAJE (fix 2026-08-05 travelId/href — MUERTO desde v1.72.8 confirmado en vivo 2026-08-11
		// —, ampliado 2026-08-12 travelIdForCarrier boundary-safe por celda "Código"): el first-match
		// por texto puede tomar una fila ajena en el carrier compartido.
		const row =
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
					: this.page.locator('tbody tr').filter({ hasText: searchText }).first();
		await expect(
			row,
			travelIdForCarrier != null
				? `La fila del viaje ${travelIdForCarrier}-W debe estar visible en la pestaña tras filtrar (anclaje por código WEB)`
				: travelId != null
					? `La fila del viaje ${travelId} debe estar visible en la pestania tras filtrar (anclaje por travelId)`
					: `La grilla debe publicar una fila que matchee "${searchText}" tras filtrar`
		).toBeVisible({ timeout: 15_000 });

		// Botón Clonar de la fila: ícono fa-files-o (FE) con fallback por tooltip title/aria.
		const cloneBtn = row
			.locator(
				'button.action-btn:has(i.fa-files-o), button[title="Clonar"], button[aria-description="Clonar"], button[title="Clone"]'
			)
			.first();
		await expect(cloneBtn, 'La fila debe exponer el botón Clonar (fa-files-o)').toBeVisible({ timeout: 10_000 });
		await cloneBtn.click();

		// gotToClone navega al alta precargada: /#/home/carrier/travel/create?travelId=<id>
		await expect(this.page).toHaveURL(/travel\/create\?(?:.*&)?travelId=\d+/, { timeout: 15_000 });
	}

	/** Columna "Por Asignar" del tablero de gestión (para aserciones not-contains). */
	porAsignarColumn(): Locator {
		return this.legacy.porAsignarColumn();
	}
}
