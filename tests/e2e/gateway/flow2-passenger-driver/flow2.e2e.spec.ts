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
 * Estado actual: BLOQUEADO
 * Razón: El dispositivo Android de prueba está siendo usado por otro equipo
 * para desarrollo de la Passenger App. Los selectores de PassengerWalletScreen
 * requieren validación con Appium Inspector en el dispositivo físico.
 *
 * Desbloqueado cuando:
 *   1. Dispositivo disponible
 *   2. Selectores de PassengerWalletScreen completados (30 TODOs en el screen)
 *   3. PassengerTripHappyPathHarness validado end-to-end
 *   4. getPassengerAppConfig() disponible en appiumRuntime.ts
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
				'[E2E-FLOW2-TC001] Bloqueado: dispositivo de prueba ocupado por otro equipo. ' +
				'Selectores de PassengerWalletScreen pendientes de validar con Appium Inspector. ' +
				'Ver tests/mobile/appium/passenger/PassengerWalletScreen.ts (30 TODOs).',
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
				'[E2E-FLOW2-TC002] Bloqueado: mismo bloqueo que TC001. ' +
				'Adicionalmente requiere validar 3DS challenge desde WebView en Passenger App.',
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
				'[E2E-FLOW2-TC003] Bloqueado: mismo bloqueo que TC001. ' +
				'Requiere adicionalmente: switch de modo a "business" en PassengerHomeScreen.',
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
				'[E2E-FLOW2-TC004] Bloqueado: mismo bloqueo que TC001 + TC002 + TC003.',
			);
		},
	);
});
