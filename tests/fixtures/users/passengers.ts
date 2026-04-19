/**
 * Passengers fixture — usuarios transversales para tests MAGIIS.
 *
 * Re-export del registro canónico en `features/gateway-pg/data/passengers.ts`.
 * La fuente original queda allí por historial, pero el punto de entrada
 * preferido para imports nuevos es `tests/fixtures/users/passengers`.
 *
 * Estos usuarios son transversales — los puede usar cualquier feature
 * (gateway-pg, smoke, flows E2E, mobile, futuras features).
 */

export {
	PASSENGERS,
	type TestPassenger,
} from '../../features/gateway-pg/data/passengers';
