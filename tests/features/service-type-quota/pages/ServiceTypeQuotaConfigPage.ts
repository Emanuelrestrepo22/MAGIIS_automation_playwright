/**
 * Page object para configurar el cupo (cantidad limitada de usos) de un service type y para
 * resetear cupos globalmente desde el portal carrier (Configuración → Tipos de Servicios).
 *
 * MX-6057 / TS-MX6057-E2E-CUPO.
 * Navegación + listado + botón de reset + modal "Confirm Reset": aterrizados en exploración UAT
 * v1.72.6 (carrier 1040) + recording `tests/test-1.spec.ts`. Selectores por texto son BILINGÜES
 * (EN|ES, ver ./i18n) porque la app tiene toggle de idioma. Los ids (#usagePeriodType) son
 * locale-agnósticos. Lo que falta confirmar en vivo queda como TODO(codegen).
 */
import { type Page, type Locator } from '@playwright/test';
import { getPortalUrl } from '../../../config/gatewayPortalRuntime';
import { L, PERIOD, type PeriodKey } from './i18n';

export class ServiceTypeQuotaConfigPage {
	readonly page: Page;
	readonly newServiceTypeButton: Locator;
	readonly usagePeriodTypeSelect: Locator;
	readonly quantityInput: Locator;

	constructor(page: Page) {
		this.page = page;
		this.newServiceTypeButton = page.getByRole('button', { name: L.newServiceType });
		this.usagePeriodTypeSelect = page.locator('#usagePeriodType');
		this.quantityInput = page.getByRole('spinbutton', { name: L.quantity });
	}

	/** Ruta directa al listado de tipos de servicio (confirmada en UAT v1.72.6). */
	async goto(): Promise<void> {
		await this.page.goto(`${getPortalUrl('carrier')}/#/home/carrier/settings/servicesType/list`);
		await this.newServiceTypeButton.waitFor();
	}

	/** Fila del listado localizada por nombre de service type (estable). */
	private serviceTypeRow(serviceTypeName: string): Locator {
		return this.page.getByRole('row', { name: serviceTypeName });
	}

	/**
	 * Abre el editor del service type (icono de lápiz = primer botón de la fila).
	 * Las filas CON cupo (p.ej. "v1.72.6") muestran 3 botones (editar / eliminar / resetear cupo).
	 */
	async openServiceTypeEditor(serviceTypeName: string): Promise<void> {
		await this.serviceTypeRow(serviceTypeName).getByRole('button').first().click();
	}

	/** Configura el cupo del service type abierto: período de uso + cantidad. */
	async setQuota(period: PeriodKey, quantity: number): Promise<void> {
		// Sección "Configuración de Límite de Uso" (validada en UAT, ST id=467). Requiere "Limitar" activo.
		// TODO(codegen): activar el toggle "Limitar" si el cupo aún no está habilitado.
		await this.usagePeriodTypeSelect.locator('.below .single .value').click();
		await this.page.getByRole('listitem').filter({ hasText: PERIOD[period] }).click();
		await this.quantityInput.fill(String(quantity));
		// Editor de ST existente guarda con "Actualizar"/"Update".
		await this.page.getByRole('button', { name: L.update }).click();
	}

	/**
	 * Reset global del cupo del service type (todos los colaboradores). Mapea a countsReset (MX-6057).
	 * El botón de reset SOLO aparece en filas con cupo; abre un modal de confirmación.
	 * TODO(codegen): confirmar el índice/tooltip exacto del botón de reset de la fila.
	 */
	async resetQuotaForAllCollaborators(serviceTypeName: string): Promise<void> {
		await this.serviceTypeRow(serviceTypeName).getByRole('button').last().click();
		// Modal: "If you perform this action, ..." → "Confirm Reset"/"Confirmar Reset".
		await this.page.getByRole('button', { name: L.confirmReset }).click();
	}
}
