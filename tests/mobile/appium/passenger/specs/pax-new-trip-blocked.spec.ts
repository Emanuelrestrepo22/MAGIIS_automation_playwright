/**
 * TC-PAX-NEW-TRIP-BLOCKED — App bloquea alta de viaje si pax tiene viaje activo o en conflicto
 *
 * TC fuente: docs/test-cases/mobile/TC-PAX-NEW-TRIP-BLOCKED-BY-ACTIVE-OR-CONFLICT.md
 * Validado manualmente: 2026-04-17
 * Portal: App Pax (Android) — Appium
 * Prioridad: P1 — regla de negocio dura
 *
 * Precondición para ejecutar:
 *   El user PASSENGER_EMAIL debe tener al menos un viaje en alguno de estos estados:
 *   - SEARCHING_DRIVER (Carrier → Por asignar)
 *   - EN_CURSO (Carrier → En curso)
 *   - NO_AUTORIZADO (Carrier → En conflicto)
 *   Crear el viaje previo desde el portal Carrier antes de correr este spec.
 *
 * Variables de entorno requeridas:
 *   APPIUM_SERVER_URL
 *   ANDROID_PASSENGER_APP_PACKAGE
 *   PASSENGER_EMAIL
 *   PASSENGER_PASSWORD
 *
 * Estado: DRAFT — pendiente validación con dispositivo físico.
 * Desbloqueado cuando:
 *   1. Dispositivo Android disponible con Appium Server activo
 *   2. PASSENGER_EMAIL tiene viaje previo activo (creado desde Carrier)
 *   3. Selectores validados con dump en vivo
 */

import { test, expect } from '@playwright/test';
import { getPassengerAppConfig } from '../../config/appiumRuntime';
import { PassengerNewTripScreen } from '../PassengerNewTripScreen';
import { PassengerHomeScreen } from '../PassengerHomeScreen';

const ORIGIN      = process.env.E2E_ORIGIN      ?? 'Reconquista 661, Buenos Aires';
const DESTINATION = process.env.E2E_DESTINATION ?? 'Av. 9 de Julio 1000, Buenos Aires';

test.describe('[TC-PAX-NEW-TRIP-BLOCKED] App Pax — bloqueo de alta de viaje por viaje activo o NO_AUTORIZADO', () => {
	test.describe.configure({ mode: 'serial' });

	test(
		'[TC-PAX-NEW-TRIP-BLOCKED][PASO-4] modal "Ya tiene un viaje creado" aparece al intentar crear viaje con precondición activa',
		async () => {
			test.fixme(
				!process.env.APPIUM_SERVER_URL,
				'[TC-PAX-NEW-TRIP-BLOCKED] Bloqueado: APPIUM_SERVER_URL no definido. ' +
				'Requiere dispositivo Android con Appium Server activo y viaje previo activo en Carrier.',
			);

			const config      = getPassengerAppConfig();
			const homeScreen  = new PassengerHomeScreen(config);
			const tripScreen  = new PassengerNewTripScreen(config);

			await homeScreen.startSession();

			try {
				await homeScreen.openHome();
				await homeScreen.ensureProfileMode('personal');

				await tripScreen.setOrigin(ORIGIN);
				await tripScreen.setDestination(DESTINATION);

				// Tap Viajo Ahora — debería disparar el modal bloqueante
				await tripScreen.confirmTrip().catch(() => {});

				// Debería: modal app-confirm-modal con "Ya tiene un viaje creado" visible
				const isBlocked = await tripScreen.detectTripAlreadyCreatedModal(8_000);
				expect(isBlocked).toBe(true);
			} finally {
				await homeScreen.endSession().catch(() => {});
			}
		},
	);

	test(
		'[TC-PAX-NEW-TRIP-BLOCKED][PASO-5] CTA "Aceptar" cierra el modal y vuelve a app-travel-info con datos intactos',
		async () => {
			test.fixme(
				!process.env.APPIUM_SERVER_URL,
				'[TC-PAX-NEW-TRIP-BLOCKED] Bloqueado: requiere dispositivo Android disponible.',
			);

			const config      = getPassengerAppConfig();
			const homeScreen  = new PassengerHomeScreen(config);
			const tripScreen  = new PassengerNewTripScreen(config);

			await homeScreen.startSession();

			try {
				await homeScreen.openHome();
				await homeScreen.ensureProfileMode('personal');

				await tripScreen.setOrigin(ORIGIN);
				await tripScreen.setDestination(DESTINATION);
				await tripScreen.confirmTrip().catch(() => {});

				const isBlocked = await tripScreen.detectTripAlreadyCreatedModal(8_000);
				expect(isBlocked).toBe(true);

				// Tap Aceptar — modal debe cerrarse
				await tripScreen.dismissTripAlreadyCreatedModal();

				// Debería: app-travel-info visible nuevamente con datos intactos
				const backOnTravelInfo = await tripScreen['waitForWebUrlContains']?.('TravelInfo', 5_000)
					?? await tripScreen['waitForWebText']?.('Seleccionar Vehiculo', 5_000, true);
				expect(backOnTravelInfo).toBe(true);
			} finally {
				await homeScreen.endSession().catch(() => {});
			}
		},
	);

	test(
		'[TC-PAX-NEW-TRIP-BLOCKED][PASO-6] bloqueo persiste mientras exista la precondición (segundo intento)',
		async () => {
			test.fixme(
				!process.env.APPIUM_SERVER_URL,
				'[TC-PAX-NEW-TRIP-BLOCKED] Bloqueado: requiere dispositivo Android disponible.',
			);

			const config      = getPassengerAppConfig();
			const homeScreen  = new PassengerHomeScreen(config);
			const tripScreen  = new PassengerNewTripScreen(config);

			await homeScreen.startSession();

			try {
				await homeScreen.openHome();
				await homeScreen.ensureProfileMode('personal');
				await tripScreen.setOrigin(ORIGIN);
				await tripScreen.setDestination(DESTINATION);

				// Primer intento → modal → Aceptar
				await tripScreen.confirmTrip().catch(() => {});
				await tripScreen.detectTripAlreadyCreatedModal(8_000);
				await tripScreen.dismissTripAlreadyCreatedModal();

				// Segundo intento sin limpiar precondición → mismo modal
				await tripScreen.confirmTrip().catch(() => {});
				const stillBlocked = await tripScreen.detectTripAlreadyCreatedModal(8_000);

				// Debería: bloqueo persistente hasta que Carrier limpie los viajes
				expect(stillBlocked).toBe(true);
			} finally {
				await homeScreen.endSession().catch(() => {});
			}
		},
	);
});
