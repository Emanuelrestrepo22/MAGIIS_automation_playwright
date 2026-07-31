/**
 * Guard de arquitectura (post-review A1) — consistencia adapter ↔ resolver ↔ registries.
 *
 * Ejecuta `assertAdapterFixtureConsistency()` (helpers/adapters) dentro del project
 * `unit` (testMatch `*.unit.spec.ts` en playwright.gateway-pg.config.ts) para que el
 * drift entre adapters declarativos, resolver de tarjetas, registry Xray y journey
 * defaults falle en CI — hasta ahora el check existía pero NO se ejecutaba en ninguna
 * suite ("NO se ejecuta automáticamente", doc del helper).
 *
 * Test PURO (sin browser): importa `test` plano de @playwright/test — no pide el
 * fixture `page`, así el runner no lanza Chromium (a diferencia del piloto
 * stripe-card-declined.unit.spec.ts, que sí mockea red sobre una página real).
 * 100% offline y determinista: solo valida datos estáticos en memoria.
 *
 * Ejecución:
 *   npx playwright test -c playwright.gateway-pg.config.ts --project=unit --grep "consistency"
 */
import { test, expect } from '@playwright/test';
import { assertAdapterFixtureConsistency } from '@features/gateway-pg/helpers/adapters';

test.describe('[unit] Adapters — consistencia declarativa cross-gateway @gateway @unit @regression', () => {
	test('@unit assertAdapterFixtureConsistency: adapters ↔ resolver ↔ xray-keys ↔ journey-defaults sin drift', () => {
		// Lanza con detalle [adapter-fixture-drift] si alguna de las 7 invariantes rompe;
		// devuelve `true` si todo consistente (firma: `(): true`).
		expect(assertAdapterFixtureConsistency()).toBe(true);
	});
});
