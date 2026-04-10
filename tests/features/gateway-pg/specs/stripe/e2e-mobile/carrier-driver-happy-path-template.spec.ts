import { test, expect } from '../../../../../TestBase';
import { CARRIER_DRIVER_HAPPY_PATH_SCENARIOS } from '../../../data/driver-happy-path-scenarios';
import { HybridCarrierDriverHappyPathHarness } from '../../../helpers/hybridCarrierDriverHappyPathHarness';

const RUN_MOBILE_HAPPY_PATH = process.env.RUN_MOBILE_HAPPY_PATH === 'true';

test.describe.serial('Gateway PG · E2E Mobile · Carrier -> Driver happy path template', () => {
	test.use({ role: 'carrier', storageState: undefined });

	for (const scenario of CARRIER_DRIVER_HAPPY_PATH_SCENARIOS) {
		test(`[${scenario.testCaseId}] ${scenario.title}`, async ({ page }) => {
			test.fixme(
				!scenario.rules.active,
				'Escenario mapeado en la plantilla. Activar rules.active=true cuando el caso quede listo para ejecución.'
			);
			test.skip(
				!RUN_MOBILE_HAPPY_PATH,
				'Set RUN_MOBILE_HAPPY_PATH=true para ejecutar Appium + Driver app.'
			);

			const harness = new HybridCarrierDriverHappyPathHarness(page);
			const result = await harness.runScenario(scenario, {
				loginFirst: true,
				runMobile: true,
			});

			expect(result.web.tripId).toBeTruthy();
			expect(result.mobile).not.toBeNull();
			expect(result.mobile?.checkpoints.map((checkpoint) => checkpoint.stage)).toEqual([
				'confirm',
				'in-progress',
				'resume',
				'closed',
			]);
			expect(result.mobile?.totalAmount).toBeTruthy();
		});
	}
});

