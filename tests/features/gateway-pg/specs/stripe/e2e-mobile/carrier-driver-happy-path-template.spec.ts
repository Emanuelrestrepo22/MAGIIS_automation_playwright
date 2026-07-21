/**
 * Gateway PG · E2E Mobile · Carrier -> Driver happy-path TEMPLATE (Appium hybrid).
 *
 * KATA conformance: DEFERRED a Fase 4 (capa mobile KATA). El runner es el shell de
 * Playwright, pero la automatización del dispositivo es Appium/WebdriverIO vía
 * HybridCarrierDriverHappyPathHarness (tests/mobile/appium/*). @TestFixture sólo
 * expone Page/API/DB de Playwright — no existe tests/components/ui/mobile + fixture
 * Appium; forzar @TestFixture inventaría arquitectura y rompería el harness, así que
 * se preserva TestBase + fixme/skip. Amolde real = Fase 4: ui/mobile + fixture Appium
 * + recording->selectores. Normalizado no-destructivo: imports por alias
 * (@TestBase/@features); los de tests/mobile/appium quedan relativos (no hay alias
 * @mobile — Fase 4).
 *
 * @atc idmap (área -> key más cercana, PENDIENTE REASIGNAR — idmap API-level, sin 1:1
 *   con e2e-mobile UI): carrier->driver hold/cobro -> área E (MG-158..160) / F (MG-161..164).
 */
import { test, expect } from '@TestBase';
import { CARRIER_DRIVER_HAPPY_PATH_SCENARIOS } from '@features/gateway-pg/data/driver-happy-path-scenarios';
import { HybridCarrierDriverHappyPathHarness } from '@features/gateway-pg/helpers/hybridCarrierDriverHappyPathHarness';

const RUN_MOBILE_HAPPY_PATH = process.env.RUN_MOBILE_HAPPY_PATH === 'true';

test.describe.serial('Gateway PG · E2E Mobile · Carrier -> Driver happy path template @gateway @stripe @e2e-hybrid @hold @critical', () => {
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

