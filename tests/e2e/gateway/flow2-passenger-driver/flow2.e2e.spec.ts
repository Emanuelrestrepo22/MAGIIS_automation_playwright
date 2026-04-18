/**
 * Flow 2 — E2E Passenger App + Driver App
 * Proyecto: e2e
 *
 * TCs planificados:
 *   E2E-FLOW2-TC001 — Passenger personal sin 3DS → driver completa viaje
 *   E2E-FLOW2-TC002 — Passenger personal con 3DS → driver completa viaje
 *   E2E-FLOW2-TC003 — Passenger business sin 3DS → driver completa viaje
 *   E2E-FLOW2-TC004 — Passenger business con 3DS → driver completa viaje
 *
 * Flujo completo (cuando esté desbloqueado):
 *   [MOBILE-PAX]  Passenger agrega tarjeta al wallet
 *   [MOBILE-PAX]  Passenger crea viaje (origen → destino)
 *   [BRIDGE]      JourneyContext escrito con status passenger-trip-created
 *   [MOBILE-DRV]  Driver recibe push notification → acepta → ejecuta → cierra viaje
 *   [MOBILE-PAX]  Passenger verifica viaje completado + cobro procesado
 *   [BRIDGE]      JourneyContext final: status driver-completed
 *
 * Estado actual: BLOQUEADO — pendiente validación E2E en dispositivo físico
 * PassengerWalletScreen + PassengerNewTripScreen + harness están implementados.
 *
 * Desbloqueado cuando:
 *   1. Dispositivo Android disponible para correr sesión Appium end-to-end
 *   2. Validar que PASSENGER_EMAIL no tenga viajes activos / NO_AUTORIZADO previos
 *      (limpiar desde Carrier portal — ver TC-PAX-NEW-TRIP-BLOCKED-BY-ACTIVE-OR-CONFLICT)
 *   3. Confirmar selectores con dump en vivo en el dispositivo físico (TC-PAX-HOLD-STEPS)
 *   4. getPassengerAppConfig() retorna config correcta para el dispositivo de CI
 *
 * Estructura de los specs está completa — solo se necesitan los selectores.
 * Ver: tests/mobile/appium/passenger/PassengerWalletScreen.ts
 */

import { test } from '../../../TestBase';

// ─── TC001 — Passenger personal sin 3DS ──────────────────────────────────────

test.describe('[E2E-FLOW2-TC001] E2E Flow 2 — Passenger App + Driver App — Personal sin 3DS', () => {
	test(
		'[E2E-FLOW2-TC001] Passenger agrega tarjeta personal (4242) → crea viaje → driver completa',
		async () => {
			// TODO (requiere dispositivo):
			//   1. Conectar PassengerTripHappyPathHarness con selectores validados
			//   2. Ejecutar fase mobile con mobile-phase-passenger.ts
			//   3. Conectar fase driver con DriverTripHappyPathHarness
			//   4. Validar JourneyContext final driver-completed
			test.fixme(
				true,
				'[E2E-FLOW2-TC001] Bloqueado: requiere dispositivo Android disponible para sesión Appium. ' +
				'Screens implementados — pendiente validación E2E end-to-end. ' +
				'Precondición: limpiar viajes activos/NO_AUTORIZADO del user en Carrier.',
			);
		},
	);
});

// ─── TC002 — Passenger personal con 3DS ──────────────────────────────────────

test.describe('[E2E-FLOW2-TC002] E2E Flow 2 — Passenger App + Driver App — Personal con 3DS', () => {
	test(
		'[E2E-FLOW2-TC002] Passenger agrega tarjeta personal 3DS (3155) → completa desafío → driver completa',
		async () => {
			// TODO (requiere dispositivo):
			//   1. Mismos prerrequisitos que TC001
			//   2. Agregar manejo de 3DS challenge en PassengerWalletScreen
			//      (WebView con iframe Stripe — ver helpers/threeDsChallenge.ts)
			test.fixme(
				true,
				'[E2E-FLOW2-TC002] Bloqueado: requiere dispositivo Android disponible. ' +
				'3DS challenge en WebView passenger identificado y documentado en TC-PAX-HOLD-STEPS.',
			);
		},
	);
});

// ─── TC003 — Passenger business sin 3DS ──────────────────────────────────────

test.describe('[E2E-FLOW2-TC003] E2E Flow 2 — Passenger App + Driver App — Business sin 3DS', () => {
	test(
		'[E2E-FLOW2-TC003] Passenger business agrega tarjeta (4242) → crea viaje → driver completa',
		async () => {
			test.fixme(
				true,
				'[E2E-FLOW2-TC003] Bloqueado: requiere dispositivo Android disponible. ' +
				'PassengerHomeScreen.ensureProfileMode("business") implementado y validado.',
			);
		},
	);
});

// ─── TC004 — Passenger business con 3DS ──────────────────────────────────────

test.describe('[E2E-FLOW2-TC004] E2E Flow 2 — Passenger App + Driver App — Business con 3DS', () => {
	test(
		'[E2E-FLOW2-TC004] Passenger business agrega tarjeta 3DS (3155) → completa desafío → driver completa',
		async () => {
			test.fixme(
				true,
				'[E2E-FLOW2-TC004] Bloqueado: requiere dispositivo Android disponible. ' +
				'Depende de TC001 + TC002 + TC003 desbloqueados.',
			);
		},
	);
});
