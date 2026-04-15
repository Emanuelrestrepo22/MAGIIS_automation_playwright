/**
 * Legacy passenger -> driver sketch.
 *
 * Active passenger implementation:
 *   tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-3ds.e2e.spec.ts
 *
 * Active script:
 *   pnpm test:test:e2e:passenger
 */

import { test } from '../TestBase';

test.describe.skip('[E2E-FLOW-2] Passenger App -> Driver App legacy sketch', () => {
	test('FLOW2-legacy', async () => {
		test.skip(
			true,
			'Use pnpm test:test:e2e:passenger for the active passenger lane.'
		);
	});
});
