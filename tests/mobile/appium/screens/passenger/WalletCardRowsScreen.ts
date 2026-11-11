/**
 * WalletCardRowsScreen — filas de tarjetas del wallet del pasajero: contar, abrir la accion de una fila
 * (trash / star) y esperar a que baje el conteo. Solo acciones atomicas; la secuencia de negocio vive en
 * `PassengerWalletPBO`.
 */

import { sleep } from '../../core/Waits';
import type { WebViewKit } from '../shared/WebViewKit';

export class WalletCardRowsScreen {
	constructor(private readonly kit: WebViewKit) {}

	async countCards(): Promise<number> {
		return this.kit.executeInWebView((rowSelector: string) => {
			const isVisible = (element: Element): boolean => {
				const html = element as HTMLElement;
				const rect = html.getBoundingClientRect();
				const style = window.getComputedStyle(html);
				return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
			};

			return Array.from(document.querySelectorAll(rowSelector)).filter(isVisible).length;
		}, 'ion-item-sliding, ion-item.card-item');
	}

	async clickCardRowAction(
		targetDigits: string | null,
		actionIcon: 'star' | 'trash'
	): Promise<{ status: string; label: string }> {
		const rowSelector = 'ion-item-sliding, ion-item.card-item';

		return this.kit
			.executeInWebView(
				async (selector: string, digits: string | null, iconName: string) => {
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

					const rows = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
					const match = digits
						? rows.find(row => {
								if (!isVisible(row)) {
									return false;
								}

								const label = row.querySelector('span.card-item-label') as HTMLElement | null;
								const labelText = normalize(label?.innerText || label?.textContent || row.textContent);
								return labelText.includes(normalize(digits));
							})
						: rows.find(isVisible);

					if (!match) {
						return { status: digits ? 'not-found' : 'empty', label: '' };
					}

					const label = normalize(
						match.querySelector('span.card-item-label')?.textContent || match.textContent || ''
					);
					const slidingItem = (
						match.tagName.toUpperCase() === 'ION-ITEM-SLIDING' ? match : match.closest('ion-item-sliding')
					) as
						| (HTMLElement & {
								open?: (side?: string) => Promise<unknown> | unknown;
						  })
						| null;
					const isPrincipalRow = (row: HTMLElement): boolean =>
						Boolean(
							row.querySelector(
								'.card-data .type > ion-icon[name="star"], .card-data .type > ion-icon[aria-label="star"], .card-data .type > ion-icon.icono_isFavorite, .card-data .type > ion-icon.ion-color-secondary'
							)
						);
					const openSlidingRow = async (row: HTMLElement | null): Promise<void> => {
						if (!row) {
							return;
						}

						const sliding = (
							row.tagName.toUpperCase() === 'ION-ITEM-SLIDING' ? row : row.closest('ion-item-sliding')
						) as
							| (HTMLElement & {
									open?: (side?: string) => Promise<unknown> | unknown;
							  })
							| null;

						if (sliding && typeof sliding.open === 'function') {
							try {
								await Promise.resolve(sliding.open('end'));
								await new Promise(resolve => setTimeout(resolve, 150));
							} catch {
								// Ignore and continue with the action button lookup below.
							}
						}
					};
					const findRowActionButton = (row: HTMLElement, iconName: string): HTMLElement | null => {
						const actionButtons = Array.from(
							row.querySelectorAll('ion-item-options button, button')
						) as HTMLElement[];
						return (
							actionButtons.find(button => {
								const values = [
									normalize(button.getAttribute('aria-label')),
									normalize(button.getAttribute('title')),
									normalize(button.innerText || button.textContent)
								];
								const icon = button.querySelector(
									`ion-icon[name="${iconName}"], ion-icon[aria-label="${iconName}"]`
								);

								return Boolean(icon) || values.some(value => value.includes(iconName));
							}) ?? null
						);
					};

					if (iconName === 'trash' && rows.length > 1 && isPrincipalRow(match)) {
						const fallbackRow =
							rows.find(row => row !== match && !isPrincipalRow(row)) ??
							rows.find(row => row !== match) ??
							null;
						if (fallbackRow) {
							await openSlidingRow(fallbackRow);
							const fallbackStar = findRowActionButton(fallbackRow, 'star');
							if (fallbackStar) {
								fallbackStar.click();
								await new Promise(resolve => setTimeout(resolve, 250));
							}
						}
					}

					await openSlidingRow(match);

					if (iconName === 'star') {
						if (isPrincipalRow(match)) {
							return { status: 'already-default', label };
						}
					}

					const directButton = findRowActionButton(match, iconName);

					if (directButton) {
						directButton.click();
						return { status: 'clicked-direct', label };
					}

					const optionsButton = match.querySelector('button.card-item-opts') as HTMLElement | null;
					if (optionsButton) {
						optionsButton.click();
						return { status: 'opened-options', label };
					}

					return { status: 'missing-action', label };
				},
				rowSelector,
				targetDigits,
				actionIcon
			)
			.catch(() => ({ status: 'error', label: '' }));
	}

	async waitForCardCountToDrop(previousCount: number, timeout = 10_000): Promise<boolean> {
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			const currentCount = await this.countCards().catch(() => previousCount);
			if (currentCount < previousCount) {
				return true;
			}

			await sleep(250);
		}

		return false;
	}
}
