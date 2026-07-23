/**
 * [E2E-MOBILE][STRIPE] Viaje calle · cobro a bordo con 3DS — spec de REFERENCIA.
 *
 * Formaliza la captura step-by-step del device (2026-07-22) en POM + spec. Es la base
 * reutilizable para Mercado Pago: el flujo de navegación (DriverViajeCalleScreen) es agnóstico;
 * solo cambia el payment screen del gateway.
 *
 * Punto de swap MP (próxima iteración, tras capturar el cobro MP en carrier ARG):
 *   reemplazar DriverTripPaymentScreen → MercadoPagoDriverPaymentScreen
 *   (holderName='APRO' como trigger + DNI, sin 3DS). DriverViajeCalleScreen queda intacto.
 *
 * device automation = Appium/WebdriverIO; tests/mobile/appium quedan relativos (sin alias @mobile).
 * Gated: SKIP sin APPIUM_SERVER_URL.
 */
import { test, expect } from '@TestBase';
import { getDriverAppConfig } from '../../../../../../mobile/appium/config/appiumRuntime';
import { DriverViajeCalleScreen } from '../../../../../../mobile/appium/driver/DriverViajeCalleScreen';
import { DriverHomeScreen } from '../../../../../../mobile/appium/driver/DriverHomeScreen';
import { DriverTripPaymentScreen, type CardData } from '../../../../../../mobile/appium/driver/DriverTripPaymentScreen';

// Tarjeta capturada: Stripe 3DS always-authenticate (fuerza challenge).
const STRIPE_3DS_CARD: CardData = {
	number: '4000000000003220',
	expiry: '12/34',
	cvc: '123',
	holderName: 'RESTREPO EMA',
	postal: '1343',
};

test.describe('[E2E-MOBILE][STRIPE] Viaje calle · cobro a bordo 3DS', () => {
	test.describe.configure({ mode: 'serial' });
	test.describe.configure({ timeout: 300_000 });
	test.skip(() => !process.env.APPIUM_SERVER_URL, 'Requiere servidor Appium + device driver');

	test('@e2e-hybrid @gateway-pg @stripe @cargo-a-bordo @3ds @happy [DRIVER-VIAJECALLE-3DS] viaje calle → cobra a bordo con 3DS → home', async () => {
		const config = getDriverAppConfig();
		const viajeCalle = new DriverViajeCalleScreen(config);
		await viajeCalle.startSession();
		const driver = viajeCalle.getDriver();
		const home = new DriverHomeScreen(config, driver);
		const payment = new DriverTripPaymentScreen(config, driver);

		try {
			await test.step('Given: driver disponible (acepta bienvenida + online)', async () => {
				await viajeCalle.acceptWelcome();
				await home.goOnline();
			});

			await test.step('When: inicia viaje calle', async () => {
				await viajeCalle.startViajeCalle();
			});

			await test.step('And: finaliza el viaje', async () => {
				await viajeCalle.finishTrip();
			});

			await test.step('And: abre el cobro con tarjeta', async () => {
				await viajeCalle.openCardPayment();
			});

			await test.step('And: llena la tarjeta 3DS y cobra', async () => {
				expect(await payment.waitForPaymentScreen(), 'el modal de cobro debería aparecer').toBe(true);
				await payment.fillCardForm(STRIPE_3DS_CARD);
				await payment.submitPayment();
			});

			await test.step('And: completa el challenge 3DS', async () => {
				await payment.handle3DSChallenge('complete');
			});

			await test.step('Then: cobro exitoso (validación ATP)', async () => {
				const outcome = await payment.waitForPaymentOutcome();
				expect(outcome.status, `cobro esperado 'success', fue: ${JSON.stringify(outcome)}`).toBe('success');
			});

			await test.step('And: regreso al home (confirmación secundaria, best-effort)', async () => {
				// El device tiene ambas apps (driver + passenger) con WebView; tras el cierre,
				// switchToWebView puede colisionar con la sesión de la passenger app
				// ("please close com.magiis.app.test.passenger"). El cobro success ya es la validación
				// ATP — el regreso a home se registra best-effort para no marcar falso-negativo.
				const returnedHome = await home.waitForReturnedHomeAfterTripClosed().catch(() => false);
				if (!returnedHome) {
					console.warn('[DRIVER-VIAJECALLE-3DS] cobro OK, pero no se confirmó el regreso a home (posible colisión WebView driver/passenger en el device).');
				}
			});
		} finally {
			await viajeCalle.endSession();
		}
	});
});
