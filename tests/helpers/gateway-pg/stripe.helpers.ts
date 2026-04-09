import type { Page } from '@playwright/test';
import {
	NewTravelPage,
	ThreeDSModal,
	ThreeDSErrorPopup
} from '../../pages/gateway-pg';
import { STRIPE_TEST_CARDS } from '../../shared/gateway-pg/stripeTestData';

export async function extractTravelIdFromUrl(page: Page): Promise<string> {
	await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
	const match = page.url().match(/\/travels\/([\w-]+)/);
	if (!match) {
		throw new Error(`Could not extract travelId from URL: ${page.url()}`);
	}

	return match[1];
}

export async function setupTravelWithFailed3DS(
	page: Page,
	opts: { passenger: string; origin: string; destination: string }
): Promise<string> {
	const travel = new NewTravelPage(page);
	const threeDS = new ThreeDSModal(page);
	const popup = new ThreeDSErrorPopup(page);

	await travel.goto();
	await travel.fillMinimum({
		...opts,
		cardLast4: STRIPE_TEST_CARDS.fail3DS.slice(-4)
	});
	await travel.submit();

	await threeDS.waitForVisible();
	await threeDS.completeFail();
	await popup.waitForVisible();
	await popup.accept();

	return extractTravelIdFromUrl(page);
}
