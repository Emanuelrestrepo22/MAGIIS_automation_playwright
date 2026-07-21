import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { getPortalUrl } from '../../config/gatewayPortalRuntime';
import { CARRIER_L } from '../shared/i18n';
// BL-i18n/v1.72.8: el guardado de preferencias por UI (toggle pre-autorización) no
// habilita "Guardar" ni persiste; el estado de hold se fija por API. Ver parameters-api.ts.
import { setHoldViaApi, readHoldEnabled } from '../../features/gateway-pg/helpers/parameters-api';

type ParametersSavePayload = {
	enableCreditCardHold?: boolean;
	ccHoldPreviousHs?: number | string;
	ccHoldCoverage?: number | string;
	[key: string]: unknown;
};

type ParametersSaveResult = {
	url: string;
	payload: ParametersSavePayload;
};

const PARAMETERS_URL = /\/magiis-v0\.2\/carriers\/\d+\/parameters$/;

export class OperationalPreferencesPage {
	private readonly page: Page;
	private readonly holdCard: Locator;
	private readonly holdCardHeader: Locator;
	private readonly holdToggle: Locator;
	private readonly holdPreviousHoursInput: Locator;
	private readonly holdCoverageInput: Locator;
	private readonly saveButton: Locator;
	private _parametersResponse: import('@playwright/test').Response | null = null;

	constructor(page: Page) {
		this.page = page;
		this.holdCard = page.locator('app-general-parameters div.card').filter({
			has: page.getByText(CARRIER_L.holdCardText),
		}).first();
		this.holdCardHeader = this.holdCard.locator('.title-flex');
		this.holdToggle = this.holdCard.locator('input.switch-input[type="checkbox"]').first();
		this.holdPreviousHoursInput = this.holdCard.locator('input[formcontrolname="ccHoldPreviousHs"]');
		this.holdCoverageInput = this.holdCard.locator('input[formcontrolname="ccHoldCoverage"]');
		this.saveButton = page.getByRole('button', { name: CARRIER_L.save }).first();
	}

	/** Acceso al `page` para helpers que fijan preferencias por API (BL-i18n / v1.72.8). */
	getPage(): Page {
		return this.page;
	}

	async goto(): Promise<void> {
		const responsePromise = this.page.waitForResponse(
			(r) => r.request().method() === 'GET' && PARAMETERS_URL.test(r.url()),
			{ timeout: 15_000 },
		).catch(() => null);

		const currentUrl = this.page.url();
		const portal = currentUrl.includes('/contractor') ? 'contractor' : 'carrier';
		const baseUrl = getPortalUrl('carrier');
		await this.page.goto(`${baseUrl}/#/home/${portal}/settings/parameters`);
		await expect(this.page.getByRole('heading', { name: CARRIER_L.preferencesHeading })).toBeVisible({ timeout: 15_000 });

		this._parametersResponse = await responsePromise;
	}

	/**
	 * Lee `enableCreditCardHold` directamente desde la respuesta GET /parameters.
	 * Fuente de verdad: API, no el estado del DOM.
	 * Retorna null si el request no fue capturado (navegar con goto() primero).
	 */
	async readHoldStateFromApi(): Promise<boolean | null> {
		if (!this._parametersResponse) return null;
		try {
			const body = await this._parametersResponse.json() as Record<string, unknown>;
			return body['enableCreditCardHold'] === true;
		} catch {
			return null;
		}
	}

	async expandHoldCard(): Promise<void> {
		if (!(await this.holdToggle.isVisible().catch(() => false))) {
			await this.holdCard.scrollIntoViewIfNeeded().catch(() => undefined);
			await this.holdCardHeader.scrollIntoViewIfNeeded().catch(() => undefined);
			await expect(this.holdCardHeader).toBeVisible({ timeout: 10_000 });
			await this.holdCardHeader.click({ force: true });
		}
		await expect(this.holdToggle).toBeVisible({ timeout: 10_000 });
	}

	async assertHoldEnabled(): Promise<void> {
		expect(await readHoldEnabled(this.page)).toBe(true);
	}

	async assertHoldDisabled(): Promise<void> {
		expect(await readHoldEnabled(this.page)).toBe(false);
	}

	async setHoldEnabled(enabled: boolean): Promise<boolean> {
		await this.expandHoldCard();

		const currentState = await this.holdToggle.isChecked();
		if (currentState !== enabled) {
			if (enabled) {
				await this.holdToggle.check({ force: true });
			} else {
				await this.holdToggle.uncheck({ force: true });
			}
			if (enabled) {
				await expect(this.holdToggle).toBeChecked({ timeout: 10_000 });
			} else {
				await expect(this.holdToggle).not.toBeChecked({ timeout: 10_000 });
			}
			await this.page.waitForTimeout(1_000);
			return true;
		}

		if (enabled) {
			await expect(this.holdToggle).toBeChecked({ timeout: 10_000 });
			return false;
		}

		await expect(this.holdToggle).not.toBeChecked({ timeout: 10_000 });
		return false;
	}

	async ensureHoldEnabled(): Promise<void> {
		await setHoldViaApi(this.page, true);
	}

	async ensureHoldDisabled(): Promise<void> {
		await setHoldViaApi(this.page, false);
	}

	async saveAndCaptureParametersPayload(timeout = 15_000): Promise<ParametersSaveResult> {
		const responsePromise = this.page.waitForResponse(
			(response) => response.request().method() === 'POST' && PARAMETERS_URL.test(response.url()),
			{ timeout }
		);

		await this.saveButton.click();

		const response = await responsePromise;
		if (!response.ok()) {
			throw new Error(`Saving operational preferences failed with status ${response.status()} at ${response.url()}`);
		}

		const request = response.request();
		const payload = request.postDataJSON() as ParametersSavePayload;
		await this.page.waitForTimeout(500);

		return {
			url: response.url(),
			payload,
		};
	}

	async save(): Promise<void> {
		await this.saveButton.click();
	}
}
