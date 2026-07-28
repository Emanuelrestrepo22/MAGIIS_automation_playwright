/**
 * Tag Playwright normalizado por pasarela — SoT única.
 * =====================================================
 *
 * El tag se DERIVA del nombre de la pasarela quitándole los guiones
 * (`'mercado-pago'` → `'@mercadopago'`), porque los scripts npm por pasarela
 * (`test:test:gateway:<tag>`) grepean el tag normalizado mientras el identifier de
 * código conserva el guion. Antes vivía duplicado en 3 sitios (S9):
 *   - `specs/_parametrized/factories/gateway-config.factory.ts`
 *   - `specs/_parametrized/factories/wallet-add-card.factory.ts`
 *   - `specs/_parametrized/hold-happy-no3ds.parametrized.spec.ts`
 *
 * Cualquier suite parametrizada nueva DEBE usar este helper: si el tag no coincide
 * con el del script npm, la suite no la alcanza `--grep` y queda invisible sin fallar
 * (fallo silencioso de cobertura). `assertGatewayTagContract()` lo verifica en el
 * project `unit`.
 */

import type { GatewayName } from '@fixtures/gateways/_shared';

/** `'mercado-pago'` → `'@mercadopago'`. Incluye el `@` (es un tag, no un slug). */
export function gatewayTag(gateway: GatewayName): string {
	return `@${gateway.replace(/-/g, '')}`;
}

/**
 * Tags esperados por pasarela — pin explícito para que un rename de `GatewayName`
 * no cambie el contrato con los scripts npm en silencio.
 */
export const EXPECTED_GATEWAY_TAGS = {
	stripe: '@stripe',
	authorize: '@authorize',
	ebizcharge: '@ebizcharge',
	'mercado-pago': '@mercadopago'
} as const satisfies Record<GatewayName, string>;

/**
 * Guard: `gatewayTag()` coincide con el tag pinneado de cada pasarela.
 *
 * @throws Si algún tag derivado divergiera del contrato de los scripts npm.
 */
export function assertGatewayTagContract(): true {
	for (const [gateway, expected] of Object.entries(EXPECTED_GATEWAY_TAGS) as [GatewayName, string][]) {
		const actual = gatewayTag(gateway);
		if (actual !== expected) {
			throw new Error(
				`[gateway-tag-drift] gatewayTag('${gateway}') = '${actual}' pero el script npm ` +
					`test:test:gateway:* grepea '${expected}'. Un tag divergente hace que la suite ` +
					'no se ejecute sin fallar (cobertura invisible).'
			);
		}
	}
	return true;
}
