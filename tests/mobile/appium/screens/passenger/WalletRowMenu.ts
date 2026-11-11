/**
 * WalletRowMenu — menu desplegado de una fila de tarjeta (popover / app-credit-card-dialog): acciones
 * "eliminar" y "Principal" y toast de confirmacion. Solo acciones atomicas.
 */

import type { WebViewKit } from '../shared/WebViewKit';

export class WalletRowMenu {
	/** Textos de la accion "eliminar" en el menu de la fila (popover). */
	private static readonly deleteActionTexts = ['Eliminar', 'Eliminar tarjeta', 'Borrar', 'Delete', 'Remove'];
	private static readonly deleteActionScopes = ['ion-popover', 'app-credit-card-dialog', '.popover-content'];

	constructor(private readonly kit: WebViewKit) {}

	async clickWalletAction(actionTexts: string[], scopeSelectors: string[]): Promise<boolean> {
		return this.kit
			.executeInWebView(
				(texts: string[], selectors: string[]) => {
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

					const targets = texts.map(normalize);
					const candidateScopes =
						selectors.length > 0
							? (Array.from(document.querySelectorAll(selectors.join(','))) as HTMLElement[])
							: [];
					const visibleScopes = candidateScopes.filter(isVisible);
					const searchScopes: (HTMLElement | Document)[] =
						visibleScopes.length > 0 ? visibleScopes : [document];

					for (const scope of searchScopes) {
						const candidates = Array.from(
							scope.querySelectorAll('button, ion-button, [role="button"], a, span, div')
						) as HTMLElement[];

						for (const target of targets) {
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
								return true;
							}
						}
					}

					return false;
				},
				actionTexts,
				scopeSelectors
			)
			.catch(() => false);
	}

	/** Pulsa "eliminar" en el menu desplegado de la fila. `false` si no se encontro la accion. */
	async tapDeleteInMenu(): Promise<boolean> {
		return this.clickWalletAction(WalletRowMenu.deleteActionTexts, WalletRowMenu.deleteActionScopes);
	}

	/** Pulsa "Principal" en el menu de la fila. */
	async tapPrincipalInMenu(): Promise<boolean> {
		return this.kit.tapWebText('Principal', 10_000, true);
	}

	/** Espera el toast de tarjeta principal cambiada. */
	async waitForPrincipalToast(timeout = 10_000): Promise<boolean> {
		return this.kit.waitForWebText('Se cambió su tarjeta principal', timeout, true);
	}
}
