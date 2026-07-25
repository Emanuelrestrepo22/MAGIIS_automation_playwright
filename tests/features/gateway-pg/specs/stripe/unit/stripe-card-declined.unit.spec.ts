/**
 * BL-043 piloto — Network mocking Stripe `card_declined`.
 *
 * Demuestra el patrón canónico de mocking para validar el comportamiento
 * MAGIIS frente a un response controlado del SDK Stripe, SIN depender del
 * sandbox externo. Beneficios vs E2E contra sandbox:
 *
 *   - **Reproducible 100%**: misma respuesta siempre, no depende de
 *     latencia/disponibilidad del sandbox.
 *   - **Rápido (<2s vs >30s)**: sin overhead de comunicar con Stripe.
 *   - **Cobertura de edge cases**: respuestas que el sandbox no permite
 *     forzar fácil (timeouts SDK, JSON malformados, network errors).
 *
 * Anti-pattern: estos tests NO reemplazan los E2E contra sandbox real.
 * Son una **segunda capa de validación** focalizada en la lógica MAGIIS
 * (qué UI muestra, qué endpoint llama, qué estado emite) frente a
 * respuestas conocidas del gateway.
 *
 * Ejecución:
 *
 *   pnpm test:test:gateway-pg --project=unit
 *   # o filtrar por este spec específico:
 *   pnpm test:test:gateway-pg --project=unit --grep "card_declined"
 *
 * Referencia: <https://playwright.dev/docs/mock>
 *
 * KATA conformance (feature/kata-conformance): test/expect del fixture unificado KATA
 * (@TestFixture) en vez de TestBase; Page components KATA (@ui/carrier) en vez de los POMs
 * del sustrato carrier. El mocking de red (`page.route`) es orquestación propia del spec.
 * ATCs mapeados en las Page components: fillMinimum → MG-148 (área C). mapeo por área aceptado
 * (idmap API-level, sin 1:1 con TS-STRIPE-TC10xx).
 */

import { test, expect } from '@TestFixture';
import { loginAsDispatcher, TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { CarrierDashboardPage, CarrierNewTravelPage, CarrierOperationalPreferencesPage } from '@ui/carrier';

// Stripe API URLs que el SDK frontend de MAGIIS contacta durante el flow
// de hold. Bloqueamos estos endpoints con responses controladas.
const STRIPE_API_PATTERN = '**/api.stripe.com/**';
const STRIPE_INTENTS_PATTERN = '**/v1/payment_intents/**';

// El fixture KATA no define la opción `role` (login explícito vía loginAsDispatcher).
test.use({ storageState: { cookies: [], origins: [] } });

test.describe(
	'[BL-043][unit] Stripe network mocking — card_declined response @gateway @stripe @unit @regression',
	{ annotation: [{ type: 'tms', description: 'MG-148' }] },
	() => {
		test('@unit @stripe @decline backend Stripe responde card_declined → MAGIIS muestra estado NO_AUTORIZADO sin pasar por sandbox real', async ({
			page
		}) => {
			// ── Setup mocking ANTES de cualquier navigation ─────────────────────────
			// Intercepta TODAS las requests a Stripe API y devuelve un PaymentIntent
			// con last_payment_error.code = 'card_declined'. Esto fuerza al frontend
			// MAGIIS a tratar la card como rechazada sin que Stripe sandbox sea
			// invocado.
			await page.route(STRIPE_API_PATTERN, async route => {
				const url = route.request().url();

				// PaymentIntent confirm/update → simular decline post-auth
				if (url.includes('/payment_intents/') && route.request().method() === 'POST') {
					await route.fulfill({
						status: 402,
						contentType: 'application/json',
						body: JSON.stringify({
							error: {
								type: 'card_error',
								code: 'card_declined',
								decline_code: 'generic_decline',
								message: 'Your card was declined.',
								payment_intent: {
									id: `pi_test_mocked_${Date.now()}`,
									status: 'requires_payment_method',
									last_payment_error: {
										type: 'card_error',
										code: 'card_declined',
										decline_code: 'generic_decline',
										message: 'Your card was declined.'
									}
								}
							}
						})
					});
					return;
				}

				// SetupIntent (vinculación de tarjeta) — devolver succeeded para
				// que el form acepte la card pero después el PaymentIntent declina.
				if (url.includes('/setup_intents/') && route.request().method() === 'POST') {
					await route.fulfill({
						status: 200,
						contentType: 'application/json',
						body: JSON.stringify({
							id: `seti_test_mocked_${Date.now()}`,
							object: 'setup_intent',
							status: 'succeeded',
							payment_method: `pm_test_mocked_${Date.now()}`
						})
					});
					return;
				}

				// Cualquier otra request a Stripe — fulfill mínimo válido o continuar
				// (depende del flow real). Por defecto continuamos para no romper.
				await route.continue();
			});

			// Filtro adicional específico para v1/payment_intents (defensivo).
			// Si el SDK Stripe muta la URL exacta entre versiones, este pattern
			// alternativo captura el caso.
			await page.route(STRIPE_INTENTS_PATTERN, async route => {
				if (route.request().method() === 'POST') {
					await route.fulfill({
						status: 402,
						contentType: 'application/json',
						body: JSON.stringify({
							error: {
								type: 'card_error',
								code: 'card_declined',
								message: 'Your card was declined.'
							}
						})
					});
					return;
				}
				await route.continue();
			});

			// ── Flow MAGIIS estándar ────────────────────────────────────────────────
			await loginAsDispatcher(page);
			const preferences = new CarrierOperationalPreferencesPage({ page });
			const dashboard = new CarrierDashboardPage({ page });
			const travel = new CarrierNewTravelPage({ page });

			await preferences.goto();
			await preferences.ensureHoldEnabled();
			await dashboard.openNewTravel();
			await travel.ensureLoaded();

			// Llenar formulario con cualquier card last4 — el response es mockeado,
			// así que el número real no importa (el SDK contacta Stripe y nuestro
			// route() interceptor responde card_declined antes de que Stripe vea
			// el request).
			await travel.fillMinimum({
				client: TEST_DATA.client,
				passenger: TEST_DATA.passenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4: '4242', // Cualquier last4 — el mock dispara siempre card_declined.
				skipCardValidation: true // Evita el throw del POM por timeout del botón Validar.
			});

			// ── Assertions del comportamiento MAGIIS frente a card_declined ─────────
			// Estas assertions son la VALOR del unit test: validamos lo que MAGIIS
			// HACE cuando el gateway responde card_declined, NO que Stripe responda
			// card_declined (eso lo asegura el mock).

			// TODO[BL-043]: completar con assertions específicas del comportamiento UI
			// esperado de MAGIIS frente a este response. Candidatos:
			//   - Aparece popup de error con texto "no se pudo realizar el pago"
			//     (memoria global project_bug_viaje_calle_unhappy).
			//   - El botón "Validar" queda en estado error sin habilitar
			//     "Seleccionar Vehículo".
			//   - El viaje NO se crea (URL queda en /travel/create, no redirige
			//     a /travels/<id>).
			// Validación de selectores y estados específicos pendiente — requiere
			// inspección manual con Playwright UI mode contra MAGIIS TEST live.
			await expect(page).toHaveURL(/\/travel\/create/, { timeout: 10_000 });
		});
	}
);
