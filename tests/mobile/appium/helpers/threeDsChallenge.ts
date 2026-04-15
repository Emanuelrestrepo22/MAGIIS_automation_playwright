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

	const logPrefix = dumpLabelPrefix || '3ds';
	const deadline = Date.now() + timeoutMs;
	let lastObservation: 'not-present' | 'failed' = 'not-present';

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

		const inlineResult = (await driver.execute((texts: string[]) => {
			const normalize = (value: unknown): string =>
				String(value ?? '')
					.replace(/\s+/g, ' ')
					.trim()
					.toLowerCase()
					.normalize('NFD')
					.replace(/[\u0300-\u036f]/g, '');
			const frameSignature = (frame: HTMLIFrameElement): string => `${frame.name ?? ''} ${frame.src ?? ''}`;
			const isStripeCardEntryFrame = (frame: HTMLIFrameElement): boolean => /elements-inner-card|cardnumber|cardexpiry|cardcvc|controller|metrics|hcaptcha/i.test(frameSignature(frame));

			const iframes = Array.from(document.querySelectorAll('iframe')) as HTMLIFrameElement[];
			const challengeFrames = iframes.filter(frame => /three-ds-2-challenge|stripe-challenge-frame|3d_secure_2|acs|authenticate|verify|challenge/i.test(frameSignature(frame)) && !isStripeCardEntryFrame(frame));
			if (!challengeFrames.length) {
				return 'not-present';
			}

			let lastFrameStatus = 'iframe-btn-not-found';
			for (const threeDsFrame of challengeFrames) {
				try {
					const frameDoc = threeDsFrame.contentDocument ?? threeDsFrame.contentWindow?.document;
					if (!frameDoc) {
						lastFrameStatus = 'iframe-no-access';
						continue;
					}

					const buttons = Array.from(frameDoc.querySelectorAll('button, [role="button"], a')) as HTMLElement[];
					for (const text of texts) {
						const target = normalize(text);
						const button = buttons.find(item => {
							const value = normalize(item.innerText ?? item.textContent);
							return item.offsetParent !== null && (value === target || value.includes(target) || target.includes(value));
						});
						if (button) {
							button.click();
							return 'completed';
						}
					}

					lastFrameStatus = 'iframe-btn-not-found';
				} catch {
					lastFrameStatus = 'iframe-cross-origin';
					continue;
				}
			}

			return lastFrameStatus;
		}, approveTexts)) as string;

		if (inlineResult === 'completed') {
			return 'completed';
		}

		if (inlineResult === 'not-present') {
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

				const overlays = Array.from(document.querySelectorAll('ion-modal, [class*="3ds"], app-confirm-modal')) as HTMLElement[];
				const visible = overlays.filter(element => {
					if (element.offsetParent === null) {
						return false;
					}

					const text = normalize(element.innerText ?? element.textContent);
					const frames = Array.from(element.querySelectorAll('iframe')) as HTMLIFrameElement[];
					const hasChallengeFrame = frames.some(frame => isStripeChallengeFrame(frame));
					const hasChallengeText = /complete|fail|authenticate|verif|3d|secure|visa|mastercard|autorizar|aprobar|submit/i.test(text);

					return hasChallengeFrame || hasChallengeText;
				});
				if (!visible.length) {
					return 'not-present';
				}

				for (const overlay of visible) {
					const buttons = Array.from(overlay.querySelectorAll('button, [role="button"]')) as HTMLElement[];
					for (const text of texts) {
						const target = normalize(text);
						const button = buttons.find(item => {
							const value = normalize(item.innerText ?? item.textContent);
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
				return 'failed';
			}

			await driver.pause(500);
			continue;
		}

		lastObservation = 'failed';
		await dumpState(`${dumpLabelPrefix}-3ds-inline-detected`);
		return 'failed';
	}

	return lastObservation;
}
