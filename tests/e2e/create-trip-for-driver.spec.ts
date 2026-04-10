import { test } from '../TestBase';
import { NewTravelPage, OperationalPreferencesPage } from '../pages/carrier';
import { expectNoThreeDSModal, loginAsDispatcher, STRIPE_TEST_CARDS } from '../features/gateway-pg/fixtures/gateway.fixtures';

const CLIENT = 'Usa Tres, Marcela';
const ORIGIN = 'Cazadores 1987, Buenos Aires, Argentina';
const DESTINATION = 'La Pampa 915, Pilar, Buenos Aires, Argentina';

test.describe('[E2E] Create trip for driver notification', () => {
	test.use({ role: 'carrier', storageState: undefined });

	test('create trip and leave it pending for the driver app', async ({ page }) => {
		test.setTimeout(120_000);

		const preferences = new OperationalPreferencesPage(page);
		const travel = new NewTravelPage(page);

		await loginAsDispatcher(page);

		await test.step('Validate hold is enabled', async () => {
			await preferences.goto();
			await preferences.ensureHoldEnabled();
		});

		await test.step('Open new travel form and complete it', async () => {
			await travel.goto();
			await travel.selectClient(CLIENT);
			await travel.assertDefaultServiceTypeRegular();
			await travel.setOrigin(ORIGIN);
			await travel.setDestination(DESTINATION);
			await travel.selectCardByLast4(STRIPE_TEST_CARDS.successDirect.slice(-4));
		});

		await test.step('Submit the trip and confirm no 3DS modal appears', async () => {
			await travel.submit();
			await expectNoThreeDSModal(page);
		});

		await test.step('Give the backend a moment to emit the driver notification', async () => {
			await page.waitForTimeout(5_000);
		});
	});
});
