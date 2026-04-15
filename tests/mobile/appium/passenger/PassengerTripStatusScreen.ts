/**
 * PassengerTripStatusScreen
 * Trip status screen in the Passenger App.
 */

import { AppiumSessionBase } from '../base/AppiumSessionBase';

type StatusSnapshot = {
	url: string;
	texts: string[];
	buttons: string[];
	matches: string[];
};

export class PassengerTripStatusScreen extends AppiumSessionBase {
	private normalizeText(value: string): string {
		return value
			.replace(/\s+/g, ' ')
			.trim()
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '');
	}

	private async collectSnapshot(): Promise<StatusSnapshot | null> {
		try {
			const driver = this.getDriver();
			const webview = await this.switchToWebView();
			if (!webview) {
				return null;
			}

			return await driver.execute(() => {
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

				const textOf = (element: Element): string => normalize((element as HTMLElement).innerText || element.textContent);
				const attrOf = (element: Element, name: string): string => normalize(element.getAttribute(name));

				const visibleElements = Array.from(
					document.querySelectorAll('button, [role="button"], ion-button, ion-item, ion-label, ion-tab-button, ion-col, span, div, a, p, h1, h2, h3')
				)
					.filter(isVisible)
					.map(element => {
						const html = element as HTMLElement;
						return {
							tag: html.tagName.toLowerCase(),
							id: normalize(html.id),
							accessibilityId: attrOf(html, 'aria-label') || attrOf(html, 'content-desc') || attrOf(html, 'data-testid'),
							text: textOf(html),
							className: normalize(typeof html.className === 'string' ? html.className : ''),
							role: attrOf(html, 'role'),
						};
					})
					.filter(item => item.id || item.accessibilityId || item.text || item.className || item.role);

				const keywords = ['asign', 'conductor', 'driver', 'camino', 'viaje', 'trip', 'complet', 'final', 'cobro', 'pago', 'charged', 'captured', 'resum'];
				const matches = visibleElements.filter(item => {
					const haystacks = [item.id, item.accessibilityId, item.text, item.className, item.role];
					return haystacks.some(value => keywords.some(keyword => value.includes(keyword)));
				});

				const buttons = Array.from(document.querySelectorAll('button, [role="button"], ion-button'))
					.map(textOf)
					.filter(Boolean);

				return {
					url: window.location.href,
					texts: Array.from(new Set(visibleElements.map(item => item.text).filter(Boolean))).slice(0, 120),
					buttons: Array.from(new Set(buttons)).slice(0, 60),
					matches: matches.map(item =>
						`${item.tag} | id=${item.id} | aria=${item.accessibilityId} | text=${item.text} | class=${item.className} | role=${item.role}`
					),
				};
			});
		} catch (error) {
			console.warn('[PassengerTripStatusScreen] collectSnapshot failed:', error instanceof Error ? error.message : error);
			return null;
		}
	}

	private async waitForStatusKeywords(keywords: string[], timeout = 10_000): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;
		const normalizedKeywords = keywords.map(keyword => this.normalizeText(keyword));

		while (Date.now() < deadline) {
			const snapshot = await this.collectSnapshot();
			if (snapshot) {
				const haystack = this.normalizeText([
					snapshot.url,
					...snapshot.texts,
					...snapshot.buttons,
					...snapshot.matches,
				].join(' '));

				if (normalizedKeywords.some(keyword => haystack.includes(keyword))) {
					return true;
				}
			}

			const pageSource = this.normalizeText(await driver.getPageSource().catch(() => ''));
			if (normalizedKeywords.some(keyword => pageSource.includes(keyword))) {
				return true;
			}

			await driver.pause(250);
		}

		return false;
	}

	/**
	 * Espera a que el viaje tenga conductor asignado.
	 */
	async waitForDriverAssigned(timeout = 60_000): Promise<void> {
		const ready = await this.waitForStatusKeywords(['asignado', 'conductor', 'driver', 'en camino'], timeout);
		if (!ready) {
			throw new Error('PassengerTripStatusScreen.waitForDriverAssigned() - assigned status not found');
		}
	}

	/**
	 * Espera a que el viaje sea completado.
	 */
	async waitForTripCompleted(timeout = 120_000): Promise<void> {
		const ready = await this.waitForStatusKeywords(['completado', 'finalizado', 'cobro', 'pago', 'captured', 'resumen'], timeout);
		if (!ready) {
			throw new Error('PassengerTripStatusScreen.waitForTripCompleted() - completion status not found');
		}
	}

	/**
	 * Obtiene el estado actual del viaje como texto.
	 */
	async getTripStatus(): Promise<string> {
		const snapshot = await this.collectSnapshot();
		if (!snapshot) {
			return '';
		}

		const normalizedCandidates = [
			...snapshot.texts,
			...snapshot.buttons,
			...snapshot.matches,
		];

		const priorityPatterns: RegExp[] = [
			/\/?viaje asignado/i,
			/\basignad[oa]\b/i,
			/\ben camino\b/i,
			/\bconductor\b/i,
			/\bdriver\b/i,
			/\ben viaje\b/i,
			/\bcompletad[oa]\b/i,
			/\bfinalizad[oa]\b/i,
			/\bcobro\b/i,
			/\bpago\b/i,
			/\bcharged\b/i,
			/\bcaptured\b/i,
			/\bresumen\b/i,
		];

		for (const pattern of priorityPatterns) {
			const match = normalizedCandidates.find(text => pattern.test(text));
			if (match) {
				return match;
			}
		}

		return normalizedCandidates[0] ?? '';
	}

	/**
	 * Verifica que el cobro fue procesado correctamente.
	 */
	async verifyPaymentProcessed(expectedAmount?: string, timeout = 120_000): Promise<void> {
		const ready = await this.waitForStatusKeywords(['cobro', 'pago', 'charged', 'captured', 'resumen'], timeout);
		if (!ready) {
			throw new Error('PassengerTripStatusScreen.verifyPaymentProcessed() - payment confirmation not found');
		}

		if (!expectedAmount) {
			return;
		}

		const snapshot = await this.collectSnapshot();
		const haystack = this.normalizeText([
			snapshot?.url ?? '',
			...(snapshot?.texts ?? []),
			...(snapshot?.buttons ?? []),
			...(snapshot?.matches ?? []),
		].join(' '));

		const normalizedAmount = this.normalizeText(expectedAmount);
		if (!haystack.includes(normalizedAmount)) {
			throw new Error(
				`PassengerTripStatusScreen.verifyPaymentProcessed() - amount "${expectedAmount}" not found in status screen`
			);
		}
	}
}
