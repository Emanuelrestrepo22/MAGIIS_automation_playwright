import type { Browser } from 'webdriverio';

/**
 * Handles the Stripe 3DS challenge if it appears in a Passenger flow.
 * The dump label prefix is reused so the caller can keep evidence grouped by flow.
 */
export async function handleThreeDsPopup(driver: Browser, dumpState: (label: string) => Promise<string>, timeoutMs: number, dumpLabelPrefix: string): Promise<'completed' | 'not-present' | 'failed'> {
	const approveTexts = ['Complete', 'Complete authentication', 'COMPLETE', 'Completar', 'Completar autenticacion', 'Autorizar', 'Aprobar', 'Confirm', 'Submit'];
	const normalize = (value: unknown): string =>
		String(value ?? '')
			.replace(/\s+/g, ' ')
			.trim()
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '');
	const frameSignature = (frame: HTMLIFrameElement): string => `${frame.name ?? ''} ${frame.src ?? ''}`;
	const isStripeCardEntryFrame = (frame: HTMLIFrameElement): boolean => /elements-inner-card|cardnumber|cardexpiry|cardcvc|controller|metrics|hcaptcha/i.test(frameSignature(frame));
	const isStripeChallengeFrame = (frame: HTMLIFrameElement): boolean => /three-ds-2-challenge|stripe-challenge-frame|3d_secure_2|acs|authenticate|verify|challenge/i.test(frameSignature(frame)) && !isStripeCardEntryFrame(frame);
	const switchFrameTarget = async (target: any): Promise<void> => {
		const browser = driver as Browser & { switchFrame?: (frame: any) => Promise<void>; switchToFrame?: (frame: any) => Promise<void> };

		if (typeof browser.switchFrame === 'function') {
			await browser.switchFrame(target);
			return;
		}

		if (typeof browser.switchToFrame === 'function') {
			await browser.switchToFrame(target);
			return;
		}

		throw new Error('Driver does not support frame switching');
	};
	const clickApproveButtonInCurrentContext = async (): Promise<boolean> =>
		driver
			.execute((texts: string[]) => {
				const normalize = (value: unknown): string =>
					String(value ?? '')
						.replace(/\s+/g, ' ')
						.trim()
						.toLowerCase()
						.normalize('NFD')
						.replace(/[\u0300-\u036f]/g, '');

				const candidates = Array.from(document.querySelectorAll('button, [role="button"], a, input[type="submit"], input[type="button"]')) as HTMLElement[];
				for (const text of texts) {
					const target = normalize(text);
					const button = candidates.find(item => {
						const raw = item.innerText ?? item.textContent ?? (item as HTMLInputElement).value ?? item.getAttribute('aria-label') ?? item.getAttribute('title') ?? '';
						const value = normalize(raw);
						return item.offsetParent !== null && (value === target || value.includes(target) || target.includes(value));
					});

					if (button) {
						button.click();
						return true;
					}
				}

				return false;
			}, approveTexts)
			.catch(() => false) as Promise<boolean>;

	const logPrefix = dumpLabelPrefix || '3ds';
	const deadline = Date.now() + timeoutMs;
	let lastObservation: 'not-present' | 'failed' = 'not-present';
	let dumpedChallengeFrame = false;

	while (Date.now() < deadline) {
		const contexts = (await driver.getContexts()) as string[];
		const externalCtx = contexts.find(context => context.startsWith('WEBVIEW') && !context.includes('com.magiis'));
		const mainCtx = contexts.find(context => context.includes('com.magiis'));

		if (externalCtx) {
			console.log(`[${logPrefix}] 3DS external context detected: ${externalCtx}`);
			await driver.switchContext(externalCtx);
			await dumpState(`${dumpLabelPrefix}-3ds-external-context`);

			const clicked = (await driver.execute((texts: string[]) => {
				const normalize = (value: unknown): string =>
					String(value ?? '')
						.replace(/\s+/g, ' ')
						.trim()
						.toLowerCase()
						.normalize('NFD')
						.replace(/[\u0300-\u036f]/g, '');

				const buttons = Array.from(document.querySelectorAll('button, [role="button"], a')) as HTMLElement[];
				for (const text of texts) {
					const target = normalize(text);
					const button = buttons.find(item => {
						const value = normalize(item.innerText ?? item.textContent);
						return item.offsetParent !== null && (value === target || value.includes(target) || target.includes(value));
					});
					if (button) {
						button.click();
						return true;
					}
				}

				return false;
			}, approveTexts)) as boolean;

			if (mainCtx) {
				await driver.switchContext(mainCtx);
			}

			return clicked ? 'completed' : 'failed';
		}

		if (mainCtx) {
			await driver.switchContext(mainCtx);
		}

		let iframeElements: any = [];
		try {
			iframeElements = await driver.$$('iframe');
		} catch {
			iframeElements = [];
		}
		const challengeFrames: Array<{ element: any; signature: string }> = [];

		for (const frame of iframeElements) {
			const name = await frame.getAttribute('name').catch(() => '');
			const src = await frame.getAttribute('src').catch(() => '');
			const signature = `${name ?? ''} ${src ?? ''}`;
			if (/three-ds-2-challenge|stripe-challenge-frame|3d_secure_2|acs|authenticate|verify|challenge/i.test(signature) && !/elements-inner-card|cardnumber|cardexpiry|cardcvc|controller|metrics|hcaptcha/i.test(signature)) {
				challengeFrames.push({ element: frame, signature });
			}
		}

		if (challengeFrames.length) {
			lastObservation = 'failed';
			if (!dumpedChallengeFrame) {
				await dumpState(`${dumpLabelPrefix}-3ds-frame-detected`);
				dumpedChallengeFrame = true;
			}

			for (const { element, signature } of challengeFrames) {
				console.log(`[${logPrefix}] 3DS challenge frame detected: ${signature}`);

				try {
					await switchFrameTarget(element);
					await driver.pause(300);

					if (await clickApproveButtonInCurrentContext()) {
						await switchFrameTarget(null);
						return 'completed';
					}
				} catch {
					// Try the next frame.
				} finally {
					await switchFrameTarget(null).catch(() => {});
				}
			}

			await driver.pause(500);
			continue;
		}

		const modalResult = (await driver.execute((texts: string[]) => {
			const normalize = (value: unknown): string =>
				String(value ?? '')
					.replace(/\s+/g, ' ')
					.trim()
					.toLowerCase()
					.normalize('NFD')
					.replace(/[\u0300-\u036f]/g, '');
			const frameSignature = (frame: HTMLIFrameElement): string => `${frame.name ?? ''} ${frame.src ?? ''}`;
			const isStripeCardEntryFrame = (frame: HTMLIFrameElement): boolean => /elements-inner-card|cardnumber|cardexpiry|cardcvc|controller|metrics|hcaptcha/i.test(frameSignature(frame));
			const isStripeChallengeFrame = (frame: HTMLIFrameElement): boolean => /three-ds-2-challenge|stripe-challenge-frame|3d_secure_2|acs|authenticate|verify|challenge/i.test(frameSignature(frame)) && !isStripeCardEntryFrame(frame);
			const isPaymentFormOverlay = (element: HTMLElement): boolean => Boolean(element.querySelector('app-credit-card-payment-data, app-credit-card-dialog'));
			const overlays = Array.from(document.querySelectorAll('ion-modal, [class*="3ds"], [class*="stripe"], app-confirm-modal, [data-react-aria-top-layer]')) as HTMLElement[];
			const visible = overlays.filter(element => {
				if (element.offsetParent === null) {
					return false;
				}

				if (isPaymentFormOverlay(element)) {
					return false;
				}

				const text = normalize(element.innerText ?? element.textContent);
				const frames = Array.from(element.querySelectorAll('iframe')) as HTMLIFrameElement[];
				const hasChallengeFrame = frames.some(frame => isStripeChallengeFrame(frame));
				const hasChallengeText = /complete(?: authentication)?|authenticate|confirm|submit|approve|authoriz|3d\s*secure|challenge/i.test(text);

				return hasChallengeFrame || hasChallengeText;
			});
			if (!visible.length) {
				return 'not-present';
			}

			for (const overlay of visible) {
				const buttons = Array.from(overlay.querySelectorAll('button, [role="button"], a, input[type="submit"], input[type="button"]')) as HTMLElement[];
				for (const text of texts) {
					const target = normalize(text);
					const button = buttons.find(item => {
						const value = normalize(item.innerText ?? item.textContent ?? (item as HTMLInputElement).value ?? item.getAttribute('aria-label') ?? item.getAttribute('title'));
						return item.offsetParent !== null && (value === target || value.includes(target) || target.includes(value));
					});
					if (button) {
						button.click();
						return 'completed';
					}
				}
			}

			return 'modal-btn-not-found';
		}, approveTexts)) as string;

		if (modalResult === 'completed') {
			return 'completed';
		}

		if (modalResult !== 'not-present') {
			lastObservation = 'failed';
			await dumpState(`${dumpLabelPrefix}-3ds-modal-detected`);
		}

		await driver.pause(500);
	}

	return lastObservation;
}
