/**
 * KATA Component (Layer 3) — Carrier · Cotización (Quote).
 *
 * SCAFFOLDING MG-178 (área QUOTE). Selectores tomados de la fuente real del FE
 * (`magiis-fe`, branch release/v1.72.x):
 *   - Form público de cotización: `src/app/quote/trip/quote-trip.component.html` (ruta `/quote`).
 *   - Envío de invitación desde carrier: `src/app/services/carrier/command/sendQuoteInvitation.command.ts`.
 *
 * Estado: estructura ejecutable con selectores grounded. El flujo end-to-end
 * (carrier envía invitación → pasajero/colaborador completa en `/quote` → hold+cobro)
 * requiere validación en vivo contra apps-test (TEST). Métodos marcados TODO(MG-178)
 * quedan pendientes de esa confirmación. NO se promete verde.
 *
 * Convención KATA: extiende UiBase (usa `this.page`); locators inline; @step en esperas.
 */

import type { Locator } from '@playwright/test';

import { expect } from '@playwright/test';
import { step } from '@utils/decorators';
import { UiBase } from '@ui/UiBase';

export type QuoteContact = {
	firstName: string;
	lastName: string;
	/** Al menos uno de mail/phone según el TC (P2-TC011-018 cubren ambas vías). */
	email?: string;
	phone?: string;
};

export class CarrierQuotePage extends UiBase {
	// Selectores reales del form público de cotización (quote-trip.component.html).
	private get serviceType(): Locator {
		return this.page.locator('#servicesType');
	}
	private get contactFirstName(): Locator {
		return this.page.locator('#contactFirstName');
	}
	private get contactLastName(): Locator {
		return this.page.locator('#contactLastName');
	}
	private get contactEmail(): Locator {
		return this.page.locator('#contactEmail');
	}
	private get contactPhone(): Locator {
		return this.page.locator('#contactPhone input, #contactPhone');
	}
	/** Componente de tarjeta preautorizada (mismo que alta de viaje). */
	private get cardValidateComponent(): Locator {
		return this.page.locator('app-credit-card-payment-data-validate');
	}

	/** Navega al formulario público de cotización. */
	@step
	async goto(): Promise<void> {
		await this.page.goto('/#/quote');
		await expect(this.serviceType.first()).toBeVisible({ timeout: 15_000 });
	}

	/** Completa los datos de contacto (colaborador) — vía mail y/o teléfono. */
	@step
	async fillContact(contact: QuoteContact): Promise<void> {
		await this.contactFirstName.fill(contact.firstName);
		await this.contactLastName.fill(contact.lastName);
		if (contact.email) await this.contactEmail.fill(contact.email);
		if (contact.phone) await this.contactPhone.first().fill(contact.phone);
	}

	/**
	 * TODO(MG-178 · QUOTE): orquestar el envío de invitación desde el portal carrier
	 * (sendQuoteInvitation) y la confirmación del hold+cobro en el form `/quote`.
	 * Requiere confirmar en vivo el entry point de "enviar cotización" y el estado del
	 * componente de tarjeta preautorizada dentro del quote (paso 4). Ver quote-trip.component.html:1092-1119.
	 */
	@step
	async completeQuoteWithHold(): Promise<void> {
		await expect(this.cardValidateComponent).toBeVisible({ timeout: 15_000 });
		throw new Error('TODO(MG-178 · QUOTE): flujo hold+cobro de cotización pendiente de validación live en TEST.');
	}
}
