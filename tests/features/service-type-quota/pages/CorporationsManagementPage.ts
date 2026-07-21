/**
 * Page object — Corporations Management (Gestión de Empresas): buscar un contractor, abrir su
 * detalle → Associates (colaboradores), leer/resetear el cupo de uso por colaborador.
 *
 * MX-6057 / TS-MX6057-E2E-CUPO. Selectores derivados del recording `tests/test-1.spec.ts`.
 * Textos BILINGÜES (EN|ES, ver ./i18n). La solapa Associates es la parte más frágil del
 * recording → varios selectores quedan TODO(codegen) para estabilizar por nombre en vivo.
 */
import { type Page, type Locator, expect } from '@playwright/test';
import { getPortalUrl } from '../../../config/gatewayPortalRuntime';
import { L } from './i18n';

export class CorporationsManagementPage {
	readonly page: Page;
	readonly searchInput: Locator;

	constructor(page: Page) {
		this.page = page;
		this.searchInput = page.getByRole('textbox', { name: L.search });
	}

	/** Ruta directa a la lista de empresas (search-gated: no muestra filas hasta buscar). */
	async goto(): Promise<void> {
		await this.page.goto(`${getPortalUrl('carrier')}/#/home/carrier/client/contractors`);
		await this.searchInput.waitFor();
	}

	/** Filtra la lista por nombre de empresa (ej. "dark empire v1.72.6"). */
	async search(name: string): Promise<void> {
		await this.searchInput.fill(name);
	}

	/**
	 * Abre el detalle del primer resultado de la búsqueda.
	 * TODO(codegen): estabilizar por nombre (el recording usa tr:nth-child(2) = 1er resultado).
	 */
	async openFirstResultDetail(): Promise<void> {
		await this.page.locator('tr:nth-child(2) > .acciones-container .action-btn-default > .fa').click();
	}

	/** Solapa Associates (colaboradores) dentro del detalle del contractor. */
	async openAssociates(): Promise<void> {
		await this.page.getByRole('link', { name: L.associates, exact: true }).click();
	}

	/**
	 * Abre el panel de uso/cupo de un colaborador (icono de la fila del associate).
	 * TODO(codegen): estabilizar por nombre del colaborador (recording: span:nth-child(3) > .fa).
	 */
	async openAssociateUsagePanel(): Promise<void> {
		await this.page.locator('.acciones-container > span:nth-child(3) > .fa').first().click();
	}

	/**
	 * Verifica que en el diálogo de uso del colaborador aparece la fila del service type.
	 * TODO(codegen): devolver el valor de la celda de conteo (usado/límite) asociada a esa fila.
	 */
	async expectServiceTypeRow(serviceTypeName: string): Promise<void> {
		await expect(this.page.getByRole('dialog').getByRole('cell', { name: serviceTypeName })).toBeVisible();
	}

	/** Cierra el diálogo de uso del colaborador. */
	async closeUsageDialog(): Promise<void> {
		await this.page.getByRole('dialog').getByText(L.close).click();
	}

	/**
	 * Reset del cupo del colaborador (por colaborador) desde el panel del associate.
	 * Mapea a DELETE /contractorEmployees/{id}/serviceType/{sid}/delete.
	 * TODO(codegen): confirmar el control exacto de reset dentro del panel + su confirmación.
	 */
	async resetAssociateQuota(): Promise<void> {
		await this.page.getByRole('dialog').getByRole('button', { name: L.accept }).click();
	}
}
