/**
 * Alias de gateway → sufijo de variable de entorno.
 *
 * Permite resolver credenciales de login por pasarela sin duplicar la lógica
 * en cada fixture. La cadena de candidatos (definida en `dispatcher.ts` /
 * `contractor-collaborator.ts`) antepone el sufijo del gateway al nombre base:
 *
 *   gateway 'mercado-pago' → 'MP' → USER_CARRIER_MP_<ENV> → USER_CARRIER_MP → …
 *
 * `GatewayName` es el SoT de gateways soportados (`tests/fixtures/gateways/_shared`);
 * este mapa DEBE cubrir todos sus valores (el `satisfies Record<...>` lo garantiza).
 */

import type { GatewayName } from '../../gateways/_shared';

/** Sufijo de credencial por gateway (`USER_CARRIER_MP`, `USER_CARRIER_AUTHORIZE`, …). */
export type GatewaySuffix = 'STRIPE' | 'AUTHORIZE' | 'MP' | 'EBIZ';

/**
 * Mapa canónico gateway → sufijo. Definido una sola vez y consumido por los
 * builders de los roles web (dispatcher, contractor-collaborator).
 */
export const GATEWAY_ENV_SUFFIX = {
	stripe: 'STRIPE',
	authorize: 'AUTHORIZE',
	'mercado-pago': 'MP',
	ebizcharge: 'EBIZ'
} as const satisfies Record<GatewayName, GatewaySuffix>;
