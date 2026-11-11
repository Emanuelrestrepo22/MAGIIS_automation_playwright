/**
 * WalletConfirmDialog — modal de confirmacion (ion-alert / app-confirm-modal) que aparece al borrar una tarjeta
 * o que puede quedar abierto antes de AGREGAR.
 */

import { sleep } from '../../core/Waits';
import type { WebViewKit } from '../shared/WebViewKit';

export class WalletConfirmDialog {
	constructor(private readonly kit: WebViewKit) {}

	async confirmDeleteDialogIfPresent(timeout = 5_000): Promise<boolean> {
		const deadline = Date.now() + timeout;
		const confirmTexts = ['Eliminar', 'Aceptar', 'Confirmar', 'Sí', 'Si', 'OK', 'Borrar', 'Continuar'];

		while (Date.now() < deadline) {
			const confirmed = await this.kit
				.executeInWebView((texts: string[]) => {
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
						return (
							style.display !== 'none' &&
							style.visibility !== 'hidden' &&
							rect.width > 0 &&
							rect.height > 0
						);
					};

					const findClickableAncestor = (element: HTMLElement): HTMLElement => {
						let current: HTMLElement | null = element;
						while (current) {
							const tag = current.tagName.toUpperCase();
							const role = normalize(current.getAttribute('role'));
							if (
								tag === 'BUTTON' ||
								tag === 'ION-BUTTON' ||
								tag === 'ION-ITEM' ||
								tag === 'ION-TAB-BUTTON' ||
								tag === 'ION-MENU-TOGGLE' ||
								tag === 'ION-COL' ||
								tag === 'A' ||
								role === 'button'
							) {
								return current;
							}
							current = current.parentElement;
						}

						return element;
					};

					const containers = Array.from(
						document.querySelectorAll(
							'ion-modal, ion-alert, app-confirm-modal, .alert-wrapper, .modal-wrapper'
						)
					) as HTMLElement[];
					const visibleContainers = containers.filter(isVisible);
					if (!visibleContainers.length) {
						return 'not-present';
					}

					for (const container of visibleContainers) {
						const candidates = Array.from(
							container.querySelectorAll('button, ion-button, [role="button"], a')
						) as HTMLElement[];
						for (const text of texts) {
							const target = normalize(text);
							const match = candidates.find(element => {
								if (!isVisible(element)) {
									return false;
								}

								const values = [
									normalize(element.innerText || element.textContent),
									normalize(element.getAttribute('aria-label')),
									normalize(element.getAttribute('content-desc')),
									normalize(element.getAttribute('title'))
								];

								return values.some(value => value === target || value.includes(target));
							});

							if (match) {
								findClickableAncestor(match).click();
								return 'clicked';
							}
						}
					}

					return 'present-no-button';
				}, confirmTexts)
				.catch(() => 'not-present');

			if (confirmed === 'clicked') {
				return true;
			}

			if (confirmed === 'not-present') {
				return false;
			}

			await sleep(250);
		}

		return false;
	}
}
