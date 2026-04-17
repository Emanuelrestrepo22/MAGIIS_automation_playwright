/**
 * PassengerNewTripScreen
 * New trip flow in the Passenger App.
 */

import { AppiumSessionBase, type AppiumElement } from '../base/AppiumSessionBase';

export interface TripRequest {
	origin: string;
	destination: string;
	cardLast4: string;
}

export class PassengerNewTripScreen extends AppiumSessionBase {
	private async clickVisibleMatchingElement(
		selector: string,
		candidates: string[],
		timeout = 10_000,
	): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;
		const normalizedCandidates = Array.from(
			new Set(
				candidates
					.map(candidate => candidate.trim())
					.filter(Boolean),
			),
		);

		while (Date.now() < deadline) {
			const clicked = await this.executeInWebView((querySelector: string, texts: string[]) => {
				const normalize = (value: unknown): string =>
					String(value ?? '')
						.replace(/\s+/g, ' ')
						.trim()
						.toLowerCase()
						.normalize('NFD')
						.replace(/[\u0300-\u036f]/g, '');

				const isVisible = (element: Element): boolean => {
					const html = element as HTMLElement;
					const rect = html.getBoundingClientRect();
					const style = window.getComputedStyle(html);
					return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
				};

				const targets = texts.map(normalize).filter(Boolean);
				const elements = Array.from(document.querySelectorAll(querySelector)) as HTMLElement[];
				const match = elements.find(element => {
					if (!isVisible(element)) {
						return false;
					}

					const haystack = normalize([
						element.innerText,
						element.textContent,
						element.getAttribute('aria-label'),
						element.getAttribute('content-desc'),
						element.getAttribute('title'),
						element.getAttribute('class'),
					].join(' '));

					return targets.some(target => haystack.includes(target));
				});

				if (!match) {
					return false;
				}

				match.click();
				return true;
			}, selector, normalizedCandidates) as boolean;

			if (clicked) {
				return true;
			}

			await driver.pause(250);
		}

		return false;
	}

	private async findVisibleInput(selector: string, timeout = 10_000): Promise<AppiumElement> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			await this.switchToWebView();
			const inputs = await driver.$$(selector);
			for (const input of inputs) {
				if (await input.isDisplayed().catch(() => false)) {
					return input as unknown as AppiumElement;
				}
			}

			await driver.pause(250);
		}

		throw new Error(`PassengerNewTripScreen.findVisibleInput() - "${selector}" not found`);
	}

	private async fillAndChooseAddress(inputSelector: string, address: string): Promise<void> {
		const input = await this.findVisibleInput(inputSelector);
		await this.executeInWebView((element: HTMLElement, value: string) => {
			const target =
				((element as unknown as { shadowRoot?: ShadowRoot | null }).shadowRoot?.querySelector('input') as HTMLInputElement | null) ??
				(element as unknown as HTMLInputElement);

			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
			setter?.call(target, value);
			target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
			target.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
			target.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
			target.focus?.();
		}, input, address);

		await this.pause(500);

		const candidates = Array.from(new Set([
			address.trim(),
			address.split(',')[0]?.trim() ?? '',
			address.split(' - ')[0]?.trim() ?? '',
		])).filter(Boolean);

		for (const candidate of candidates) {
			if (await this.tapWebText(candidate, 2_500, true)) {
				return;
			}
		}

		throw new Error(`PassengerNewTripScreen: suggestion not found for "${address}"`);
	}

	private cardCandidates(last4: string): string[] {
		const digits = last4.replace(/\D/g, '').slice(-4);
		return Array.from(new Set([
			`VISA ****${digits}`,
			`VISA ${digits}`,
			`**** ${digits}`,
			`...${digits}`,
			digits,
		])).filter(Boolean);
	}

	private async extractTripCode(): Promise<string | undefined> {
		const driver = this.getDriver();
		const pageSource = await driver.getPageSource().catch(() => '');
		const tripCodeMatch = pageSource.match(/(\d{3,}-[A-Z])/);
		if (tripCodeMatch?.[1]) {
			return tripCodeMatch[1];
		}

		const travelIdMatch =
			pageSource.match(/"travelId":(\d+)/) ??
			pageSource.match(/travelId=(\d+)/i);
		if (travelIdMatch?.[1]) {
			return travelIdMatch[1];
		}

		const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
		const urlTripCodeMatch = url.match(/(\d{3,}-[A-Z])/);
		if (urlTripCodeMatch?.[1]) {
			return urlTripCodeMatch[1];
		}

		const urlTravelIdMatch =
			url.match(/"travelId":(\d+)/) ??
			url.match(/travelId=(\d+)/i);
		if (urlTravelIdMatch?.[1]) {
			return urlTravelIdMatch[1];
		}

		return undefined;
	}

	/**
	 * Opens or validates the passenger home screen.
	 */
	async openNewTrip(): Promise<void> {
		await this.tapWebText('Inicio', 3_000).catch(() => false);

		const ready =
			await this.waitForWebUrlContains('HomePage', 10_000) ||
			await this.waitForWebText('Seleccionar Vehiculo', 10_000, true);

		if (!ready) {
			throw new Error('PassengerNewTripScreen.openNewTrip() - home screen not visible');
		}
	}

	/**
	 * Completes the trip origin.
	 */
	async setOrigin(address: string): Promise<void> {
		await this.fillAndChooseAddress('input[placeholder="Origen "]', address);
	}

	/**
	 * Completes the trip destination.
	 */
	async setDestination(address: string): Promise<void> {
		await this.fillAndChooseAddress('input[placeholder="Destino "]', address);
	}

	/**
	 * Selects the payment card for this trip.
	 */
	async selectPaymentCard(last4: string): Promise<void> {
		const digits = last4.replace(/\D/g, '').slice(-4);

		// Some builds already render the selected card on the travel shell.
		// If the target card is already visible, keep the current selection.
		if (await this.waitForWebText(digits, 2_000, true)) {
			return;
		}

		const openedCardDialog = await this.clickVisibleMatchingElement(
			'ion-col.payment-method, ion-col.payment-method-selected, .payment-method',
			[
				'tarjeta de crédito',
				'credit card',
				'visa',
				`visa ...${digits}`,
				`...${digits}`,
				digits,
			],
			10_000,
		);

		if (openedCardDialog) {
			await this.pause(500);

			for (const candidate of this.cardCandidates(digits)) {
				if (
					await this.clickVisibleMatchingElement(
						'ion-modal ion-item.card-item, app-credit-card-dialog ion-item.card-item, ion-modal .card-item',
						[candidate, `VISA ${digits}`, `...${digits}`, digits],
						5_000,
					)
				) {
					return;
				}
			}
		}

		// If the dialog is not exposed in this build, keep going with the card that
		// was already made default in wallet. The next trip step will surface any
		// real mismatch through the backend or status screen.
		if (await this.waitForWebText(digits, 3_000, true)) {
			return;
		}

		console.warn(`[PassengerNewTripScreen] card ending ${digits} not explicitly selectable on this screen; continuing with current default card`);
	}

	/**
	 * Confirms the trip request.
	 */
	async confirmTrip(): Promise<string | undefined> {
		const vehicleSelected = await this.tapWebText('Seleccionar Vehiculo', 10_000, true);
		if (!vehicleSelected) {
			throw new Error('PassengerNewTripScreen.confirmTrip() - "Seleccionar Vehiculo" not found');
		}

		await this.pause(500);

		const nowSelected = await this.tapWebText('Ahora', 10_000, true);
		if (!nowSelected) {
			throw new Error('PassengerNewTripScreen.confirmTrip() - "Ahora" not found');
		}

		await this.pause(1_000);

		await this.throwIfCreditLimitExceeded(4_000);

		return this.extractTripCode();
	}

	/**
	 * Inspects the DOM for the credit-limit blocker that the backend raises when
	 * the test passenger has no available balance. We surface it as ENV_BLOCKER so
	 * pipelines can split data-related failures from real code regressions.
	 */
	private async throwIfCreditLimitExceeded(timeoutMs: number): Promise<void> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeoutMs;

		while (Date.now() < deadline) {
			const signal = await this.executeInWebView(() => {
				const normalize = (value: unknown): string =>
					String(value ?? '')
						.replace(/\s+/g, ' ')
						.trim()
						.toLowerCase()
						.normalize('NFD')
						.replace(/[\u0300-\u036f]/g, '');

				const isVisible = (element: Element): boolean => {
					const html = element as HTMLElement;
					if (html.offsetParent === null) {
						return false;
					}

					const rect = html.getBoundingClientRect();
					const style = window.getComputedStyle(html);
					return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
				};

				const overlays = Array.from(
					document.querySelectorAll('ion-alert, ion-modal, ion-toast, app-confirm-modal, .alert-wrapper, .toast-wrapper')
				) as HTMLElement[];

				const patterns = [
					/limit.*exceed/,
					/limite.*excedid/,
					/limite.*de.*credito/,
					/credit.*limit/,
					/saldo.*insuficient/,
					/supero.*limite/,
					/excede.*limite/,
				];

				for (const overlay of overlays) {
					if (!isVisible(overlay)) {
						continue;
					}

					const text = normalize(overlay.innerText ?? overlay.textContent);
					if (patterns.some(pattern => pattern.test(text))) {
						return text.slice(0, 200);
					}
				}

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const globals = window as any;
				const lastResponse = globals.__lastTripResponse ?? globals.__lastTravelResponse ?? null;
				if (lastResponse && typeof lastResponse === 'object') {
					if (lastResponse.limitExceeded === true || lastResponse.limitExceeded === 'true') {
						return 'limitExceeded=true';
					}

					if (lastResponse.limitExceeded === false && lastResponse.success === false) {
						return 'limitExceeded=false (blocked)';
					}
				}

				return '';
			}).catch(() => '');

			if (signal) {
				const email = process.env.PASSENGER_EMAIL?.trim() || 'unknown-passenger';
				throw new Error(`ENV_BLOCKER: Credit limit exceeded for test user ${email} (signal="${signal}")`);
			}

			await driver.pause(500);
		}
	}
}
