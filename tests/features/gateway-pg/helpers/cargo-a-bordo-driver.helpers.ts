import type { GatewayPgJourneyContext } from '../contracts/gateway-pg.types';
import { advanceGatewayPgJourney } from './gatewayPgJourney';

type DriverCloseoutStepNote = {
	accept?: string;
	arrive?: string;
	finish?: string;
};

/**
 * Simulación pura del cierre del viaje Cargo a Bordo sin Appium.
 *
 * Esta capa modela el recorrido lógico Aceptar -> Arribo -> Fin sobre el
 * contexto del journey para que la suite pueda avanzar mientras el driver
 * real todavía no está automatizado.
 *
 * Cuando exista el bridge real Web/API del driver, esta helper debe ser la
 * única pieza a reemplazar.
 */
export function cargoAboardDriverAccept(context: GatewayPgJourneyContext, note?: string): GatewayPgJourneyContext {
	return advanceGatewayPgJourney(
		{
			...context,
			currentActor: 'driver',
			driverHandoff: { ...context.driverHandoff, status: 'ready' }
		},
		'driver_trip_acceptance',
		'driver-accepted',
		note ?? 'Cargo a Bordo driver accepted trip through simulated bridge'
	);
}

export function cargoAboardDriverArrive(context: GatewayPgJourneyContext, note?: string): GatewayPgJourneyContext {
	return advanceGatewayPgJourney(
		{
			...context,
			currentActor: 'driver',
			driverHandoff: { ...context.driverHandoff, status: 'ready' }
		},
		'driver_route_simulation',
		'driver-en-route',
		note ?? 'Cargo a Bordo driver arrived through simulated bridge'
	);
}

export function cargoAboardDriverFinish(context: GatewayPgJourneyContext, note?: string): GatewayPgJourneyContext {
	return advanceGatewayPgJourney(
		{
			...context,
			currentActor: 'driver',
			driverHandoff: { ...context.driverHandoff, status: 'completed' }
		},
		'driver_trip_completion',
		'driver-completed',
		note ?? 'Cargo a Bordo driver finished trip through simulated bridge'
	);
}

export function simulateCargoAboardDriverCloseout(context: GatewayPgJourneyContext, note: DriverCloseoutStepNote = {}): GatewayPgJourneyContext {
	const accepted = cargoAboardDriverAccept(context, note.accept);
	const arrived = cargoAboardDriverArrive(accepted, note.arrive);
	return cargoAboardDriverFinish(arrived, note.finish);
}
