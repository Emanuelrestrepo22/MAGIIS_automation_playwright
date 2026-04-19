/**
 * ContractorNewTravelPage — sobreescribe los métodos del formulario de nuevo viaje
 * que difieren entre el portal carrier y el portal contractor.
 *
 * Diferencias detectadas via recorder (test-21.spec.ts):
 *   - Carrier: campo cliente = #clientSelect (angular select-dropdown)
 *   - Contractor: campo usuario = texto "Seleccione un usuario" + textbox
 *   - Contractor: un único campo de usuario (cliente y pasajero son el mismo)
 *   - ensureLoaded(): espera la presencia del campo "Seleccione un usuario"
 *     en lugar de #clientSelect
 *
 * El resto del formulario (origen, destino, tarjeta Stripe, Validar, Seleccionar Vehículo)
 * es idéntico al carrier — se reutiliza desde NewTravelPage (carrier).
 */

import type { Page } from '@playwright/test';
import { NewTravelPage } from '../carrier/NewTravelPage';
import type { NewTravelFormInput } from '../carrier/NewTravelPageBase';

export class ContractorNewTravelPage extends NewTravelPage {
	/** Selector del campo "Seleccione un usuario" en contractor (evidencia: test-21.spec.ts) */
	private readonly userSelectTrigger;
	private readonly userSearchInput;

	constructor(page: Page) {
		super(page);
		this.userSelectTrigger = page.getByText('Seleccione un usuario', { exact: true }).first();
		this.userSearchInput   = page.getByRole('textbox', { name: 'Seleccione un usuario' });
	}

	/**
	 * Espera que el formulario de nuevo viaje esté listo en contractor.
	 * En carrier: espera #clientSelect visible.
	 * En contractor: espera el campo "Seleccione un usuario" visible.
	 */
	override async ensureLoaded(timeout = 15_000): Promise<void> {
		await this.userSelectTrigger.waitFor({ state: 'visible', timeout });
	}

	/**
	 * Selecciona un usuario (colaborador) en el formulario contractor.
	 * Evidencia test-21.spec.ts líneas 10-12:
	 *   - Click en el trigger "Seleccione un usuario"
	 *   - Fill con los primeros caracteres del nombre (token de búsqueda)
	 *   - Click en la primera opción .data-with-icon-col dentro del dropdown
	 */
	/**
	 * En contractor, el campo "Seleccione un usuario" reemplaza los campos
	 * cliente + pasajero del carrier. No existe #passenger separado.
	 * Esta implementación llama a selectClient() y luego avanza al resto del formulario
	 * saltando la validación de #passenger que no aplica en contractor.
	 */
	override async fillMinimum(opts: NewTravelFormInput): Promise<void> {
		const clientName = opts.client ?? opts.passenger;
		// Contractor: un único campo de usuario — no hay campo #passenger separado.
		await this.selectClient(clientName);
		await this.assertDefaultServiceTypeRegular();
		await this.setOriginContractor(opts.origin);
		await this.setDestinationContractor(opts.destination);
		await this.selectCardByLast4(opts.cardLast4, opts.skipCardValidation ?? false);
	}

	/**
	 * Limpia un campo app-input-search-place si tiene un valor pre-cargado.
	 * En contractor, tras seleccionar el usuario, el origen se auto-llena con la
	 * dirección del colaborador. Hay que limpiarla (✕) antes de escribir la nueva.
	 * Espera a que el campo vuelva al estado placeholder (vacío) tras limpiar.
	 */
	private async clearAddressFieldIfFilled(placeComponent: import('@playwright/test').Locator): Promise<void> {
		// El botón ✕ es el primer elemento con esa clase o texto dentro del componente.
		const clearBtn = placeComponent.locator('.close-btn, [class*="close"], [class*="clear"], [class*="remove"]').first();
		const hasClearBtn = await clearBtn.isVisible().catch(() => false);
		if (!hasClearBtn) {
			// Fallback: buscar el caracter ✕ o × dentro del componente
			const xBtn = placeComponent.locator('text=✕, text=×').first();
			if (await xBtn.isVisible().catch(() => false)) {
				await xBtn.click();
				await this.page.waitForTimeout(400);
			}
			return;
		}
		await clearBtn.click();
		await this.page.waitForTimeout(400);
		// Esperar que reaparezca el placeholder (campo vacío)
		const placeholder = placeComponent.locator('.placeholder').first();
		await placeholder.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
	}

	/**
	 * Abre el dropdown de un campo app-input-search-place.
	 * PRECONDICIÓN: el campo debe estar en estado vacío (placeholder visible).
	 * Retorna el search textbox visible dentro del componente.
	 */
	private async openAddressDropdown(placeComponent: import('@playwright/test').Locator): Promise<import('@playwright/test').Locator> {
		const searchInput = placeComponent.getByRole('textbox', { name: 'Ingrese una dirección' }).first();
		const clickTargets = [
			placeComponent.locator('.search-container-input > .bootstrap > .below > .single > .placeholder').first(),
			placeComponent.locator('.placeholder').first(),
			placeComponent.locator('.search-container-input').first(),
			placeComponent.locator('.toggle').first(),
		];

		for (const target of clickTargets) {
			if (!(await target.isVisible().catch(() => false))) continue;
			await target.click({ force: true });
			await this.page.waitForTimeout(400);
			if (await searchInput.isVisible().catch(() => false)) break;
		}

		await searchInput.waitFor({ state: 'visible', timeout: 10_000 });
		return searchInput;
	}

	/**
	 * Selecciona la primera sugerencia que matchea `queryText` en el dropdown.
	 * Intenta primero dentro del componente (si renderiza inline), luego a nivel de página
	 * para manejar CDK overlay global, y como último recurso el primer listitem visible.
	 * El queryText es el primer segmento de la dirección (ej: "Reconquista 661").
	 */
	private async clickAddressSuggestion(placeComponent: import('@playwright/test').Locator, queryText: string): Promise<void> {
		// Listitem dentro del componente con el texto de búsqueda
		const inlineOption = placeComponent.getByRole('listitem').filter({ hasText: new RegExp(queryText, 'i') }).first();
		if (await inlineOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
			await inlineOption.click();
			return;
		}
		// CDK overlay: listitem a nivel de página
		const pageOption = this.page.getByRole('listitem').filter({ hasText: new RegExp(queryText, 'i') }).first();
		if (await pageOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
			await pageOption.click();
			return;
		}
		// Último recurso: cualquier listitem visible a nivel de página (primer resultado)
		const anyOption = this.page.getByRole('listitem').filter({ hasText: /\S/ }).first();
		await anyOption.waitFor({ state: 'visible', timeout: 5_000 });
		await anyOption.click();
	}

	/**
	 * Busca y selecciona una dirección de origen.
	 * Flujo: limpiar pre-cargado → abrir dropdown → escribir → click sugerencia.
	 * Evidencia recorder test-21.spec.ts línea 13.
	 */
	private async setOriginContractor(address: string): Promise<void> {
		const queryText  = address.split(',')[0].trim();
		const originComp = this.page.locator('app-input-search-place[formcontrolname="origin"]');

		// Paso 1: limpiar si hay valor pre-cargado (ej: dirección del colaborador)
		await this.clearAddressFieldIfFilled(originComp);

		// Paso 2: abrir dropdown (ahora el campo está vacío → placeholder visible)
		const searchInput = await this.openAddressDropdown(originComp);

		// Paso 3: escribir la dirección tecla a tecla para disparar el autocomplete Angular
		await searchInput.pressSequentially(queryText, { delay: 70 });
		await this.page.waitForTimeout(1_800);

		// Paso 4: click en la primera sugerencia que matchee el queryText
		await this.clickAddressSuggestion(originComp, queryText);
		await this.page.waitForTimeout(600);
	}

	/**
	 * Busca y selecciona una dirección de destino.
	 * Mismo patrón que setOriginContractor.
	 * Recorder test-21.spec.ts línea 14: el primer .placeholder visible es el del destino
	 * (origen ya está seleccionado → el .placeholder del origen desapareció).
	 */
	private async setDestinationContractor(address: string): Promise<void> {
		const queryText = address.split(',')[0].trim();
		// destination usa el wrapper formarrayname="destination"
		const destComp  = this.page.locator('div.form-group-address[formarrayname="destination"] app-input-search-place')
			.or(this.page.locator('app-input-search-place').nth(1));

		// Limpiar si tiene valor (podría estar pre-llenado)
		await this.clearAddressFieldIfFilled(destComp);

		const searchInput = await this.openAddressDropdown(destComp);
		await searchInput.pressSequentially(queryText, { delay: 70 });
		await this.page.waitForTimeout(1_800);

		await this.clickAddressSuggestion(destComp, queryText);
		await this.page.waitForTimeout(600);
	}

	override async selectClient(name: string): Promise<void> {
		// Usar los primeros 3 caracteres del primer token para buscar (coincide con el recorder test-21.spec.ts).
		// pressSequentially dispara eventos de teclado reales que Angular necesita para activar la búsqueda.
		const firstToken = name.replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim().split(' ')[0];
		const searchToken = firstToken.slice(0, 3).toLowerCase();

		await this.userSelectTrigger.click();
		// Dar tiempo a Angular para abrir el dropdown (mismo patrón que carrier selectAutocompleteOption).
		await this.page.waitForTimeout(400);
		await this.userSearchInput.waitFor({ state: 'visible', timeout: 5_000 });
		// Usar pressSequentially para disparar eventos de teclado reales (Angular busca en cada keyup).
		await this.userSearchInput.pressSequentially(searchToken, { delay: 80 });
		await this.page.waitForTimeout(1_500);
		// Opción de resultado — el recorder capturó '.data-with-icon-col' first (test-21.spec.ts:12).
		const option = this.page.locator('.data-with-icon-col').first();
		await option.waitFor({ state: 'visible', timeout: 10_000 });
		await option.click();
	}
}
