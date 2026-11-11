/**
 * Script que corre DENTRO de la WebView para accionar GUARDAR del form de tarjeta (estrategias en cascada:
 * ng.doConfirmCardSetup -> ng.verifyCreditCard -> ng.submit -> form.requestSubmit -> click -> eventos sinteticos).
 * Funcion pura de navegador: no usa nada de Node ni de la sesion.
 */

export type SubmitScriptResult = {
	status: string;
	strategy: string;
	buttonRect: { x: number; y: number; w: number; h: number } | null;
	ngKeys: string[];
};

export const submitGuardarScript = (target: string): SubmitScriptResult => {
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

	const findClickableAncestor = (element: HTMLElement): HTMLElement => {
		let current: HTMLElement | null = element;
		while (current) {
			const tag = current.tagName.toUpperCase();
			const role = normalize(current.getAttribute('role'));
			if (
				tag === 'BUTTON' ||
				tag === 'ION-BUTTON' ||
				tag === 'A' ||
				tag === 'ION-ITEM' ||
				tag === 'ION-COL' ||
				role === 'button' ||
				current.classList.contains('btn')
			) {
				return current;
			}

			current = current.parentElement;
		}

		return element;
	};

	const host = document.querySelector('app-credit-card-payment-data') as HTMLElement | null;
	const scope: ParentNode = host ?? document;

	const buttonCandidates = Array.from(scope.querySelectorAll('button, ion-button')) as HTMLElement[];
	const targetText = normalize(target);
	const match = buttonCandidates.find(element => {
		if (!isVisible(element)) {
			return false;
		}

		const values = [
			normalize(element.innerText || element.textContent),
			normalize(element.getAttribute('aria-label')),
			normalize(element.getAttribute('content-desc')),
			normalize(element.getAttribute('title'))
		];
		return values.some(value => value === targetText || value.includes(targetText));
	});

	if (!match) {
		return { status: 'not-found', strategy: 'none', buttonRect: null, ngKeys: [] };
	}

	const clickable = findClickableAncestor(match);
	const disabled = Boolean(
		clickable.getAttribute('disabled') !== null ||
			clickable.getAttribute('aria-disabled') === 'true' ||
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(clickable as any).disabled === true
	);
	if (disabled) {
		return { status: 'disabled', strategy: 'none', buttonRect: null, ngKeys: [] };
	}

	const rect = clickable.getBoundingClientRect();
	const buttonRect = {
		x: Math.round(rect.left + rect.width / 2),
		y: Math.round(rect.top + rect.height / 2),
		w: Math.round(rect.width),
		h: Math.round(rect.height)
	};

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const ng = (window as any).ng;
	let ngKeys: string[] = [];
	if (host && typeof ng?.getComponent === 'function') {
		try {
			const component = ng.getComponent(host);
			if (component && typeof component === 'object') {
				ngKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(component))
					.concat(Object.keys(component))
					.filter((name, index, arr) => arr.indexOf(name) === index)
					.slice(0, 40);
			}
		} catch {
			// Continue; we'll still try requestSubmit + click fallbacks.
		}
	}

	// Primary strategy: invoke the Angular component method that performs
	// stripe.confirmCardSetup(). The public `submit()` wrapper exists but
	// appears to no-op on this build — doConfirmCardSetup() is the one that
	// actually reaches Stripe (seen via ngKeys introspection).
	// We fire-and-forget: waitForPaymentModalSubmitOutcome polls for 3DS / modal close.
	if (host && typeof ng?.getComponent === 'function') {
		try {
			const component = ng.getComponent(host);
			if (component && typeof component === 'object') {
				const fire = (name: string): boolean => {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const method = (component as any)[name];
					if (typeof method !== 'function') {
						return false;
					}
					try {
						method.call(component);
						return true;
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						return message.includes('in-flight confirmCardSetup');
					}
				};

				if (fire('doConfirmCardSetup')) {
					return { status: 'submitted', strategy: 'ng.doConfirmCardSetup', buttonRect, ngKeys };
				}

				if (fire('verifyCreditCard')) {
					return { status: 'submitted', strategy: 'ng.verifyCreditCard', buttonRect, ngKeys };
				}

				if (fire('submit')) {
					return { status: 'submitted', strategy: 'ng.submit', buttonRect, ngKeys };
				}
			}
		} catch {
			// Fall through to requestSubmit / click fallbacks.
		}
	}

	// Secondary strategy: let the form fire its (ngSubmit) through its
	// default submit button. This is the closest thing to a real user tap.
	const form = (host?.querySelector('form') ?? clickable.closest('form')) as HTMLFormElement | null;
	if (form && typeof (form as HTMLFormElement & { requestSubmit?: () => void }).requestSubmit === 'function') {
		try {
			(form as HTMLFormElement & { requestSubmit: () => void }).requestSubmit();
			return { status: 'submitted', strategy: 'form.requestSubmit', buttonRect, ngKeys };
		} catch {
			// Fall through to the click fallbacks.
		}
	}

	// Secondary: native .click() on the GUARDAR button — the Angular (click)
	// handler should fire the same path as a real tap.
	try {
		clickable.scrollIntoView({ block: 'center', inline: 'center' });
		clickable.click();
		return { status: 'submitted', strategy: 'button.click', buttonRect, ngKeys };
	} catch {
		// Fall through to synthetic dispatch below.
	}

	// Tertiary: synthetic pointer/mouse sequence.
	try {
		clickable.dispatchEvent(
			new MouseEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, view: window })
		);
		clickable.dispatchEvent(
			new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true, view: window })
		);
		clickable.dispatchEvent(
			new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true, view: window })
		);
		clickable.dispatchEvent(
			new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window })
		);
		return { status: 'submitted', strategy: 'synthetic-mouse', buttonRect, ngKeys };
	} catch {
		return { status: 'submit-failed', strategy: 'none', buttonRect, ngKeys };
	}
};
