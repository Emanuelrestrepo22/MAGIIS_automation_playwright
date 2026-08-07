/**
 * KATA Steps (orquestador de flujo) — Quote · Stripe · Colaborador (área QUOTE).
 *
 * Cubre TS-STRIPE-P2-TC011..018: "Alta de Viaje desde Quote para usuario con número de
 * teléfono / mail vinculado a usuario colaborador existente con Tarjeta Preautorizada"
 * × hold ON/OFF × con/sin 3DS. El "Cobro desde App Driver" del título es la fase mobile
 * (fuera del alcance web — mismo recorte que TC1301-1303 en la suite de hold).
 *
 * FLUJO REAL (precedente validado en vivo: `specs/authorize/web/quote/personal-quote-no-hold-happy`
 * + `QuoteWidgetPage`, grabación PASS de QA 2026-07-27):
 *   widget PÚBLICO `#/quote?pluginKey=…` (anónimo, EN) → origen/destino/pax → vehículo → nota →
 *   contacto → Quote → Payment (form NATIVO Angular — el widget usa
 *   `app-credit-card-payment-data-validate` para TODAS las pasarelas, Stripe incluido: fuente FE
 *   `quote-trip.component.html:1107`; por eso acá va `NativeAngularCardForm` y NO
 *   `cardFormFor('stripe')`, que resolvería Stripe Elements del portal) → Confirm your Quote →
 *   confirmación por MAIL (regla de negocio: el alta ocurre recién ahí, como PROGRAMADO) →
 *   oráculo en el portal (pestaña Programados, estado válido).
 *
 * REGLA DE VÍNCULO (fuente BE `QuotesService.getPassenger` — define los dos ejes de la matriz):
 *   resolución 1º por MAIL, 2º por TELÉFONO; sin match crea un pax NUEVO. Por eso:
 *   - linkBy 'mail'  → mail registrado del colaborador + teléfono sintético NO registrado;
 *   - linkBy 'phone' → teléfono REGISTRADO (resuelto por API, no inventado) + casilla yopmail
 *     sintética no registrada (la resolución cae a la de teléfono — el eje queda aislado).
 *   Oráculo del eje "usuario EXISTENTE": el conteo de pax que matchean la búsqueda NO debe
 *   crecer tras el alta (si el vínculo falla, el BE crea un duplicado con el mismo nombre y un
 *   viaje idéntico en la grilla taparía el fallo — ver countCarrierPassengers).
 *
 * 3DS (TC015..018 — FRAGILE/TODO(live)): el challenge de Stripe no está confirmado en vivo
 * dentro del widget. Se cubren las DOS ventanas posibles (post-Confirm en el widget y la landing
 * de confirmación del mail, donde el BE recién crea viaje+hold) con `challengeSeen`
 * anti-verde-vacío (MEDIUM-3) para la variante 3DS sin hold; con hold ON protege el estado en
 * el portal (challenge no aprobado ⇒ hold NO_AUTH ⇒ la fila no queda en Programados).
 *
 * Convención KATA: extiende UiBase; recibe `browser` explícito en el método (las preconditions
 * hold/tarjeta/conteo viven en sesiones dispatcher NUEVAS — el widget es anónimo; mismo criterio
 * que `expectQuoteTripInPortal`). NO se promete verde: primera corrida live valida selectores
 * del widget con carrier Stripe + eco del teléfono registrado en el form.
 */

import type { Browser, Page } from '@playwright/test';
import type { TestContextOptions } from '@TestContext';
import type { GenericTestCard } from '@fixtures/gateways/_shared';

import { test, expect } from '@TestFixture';
import { UiBase } from '@ui/UiBase';
import { ThreeDsChallengePage } from '@ui/ThreeDsChallengePage';
import { QuoteWidgetPage } from '@ui/QuoteWidgetPage';
import { NativeAngularCardForm } from '@ui/carrier/card-forms';
import { resolveCard } from '@fixtures/gateways/_shared';
import { journeyDefaultsFor } from '@features/gateway-pg/data/journey-defaults';
import { expectNoThreeDSModal } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { clearQuoteRequesterCard } from '@features/gateway-pg/helpers/quote-card-precondition';
import { confirmQuoteByMail, countQuoteMailsInInbox } from '@features/gateway-pg/helpers/quote-mail-confirmation';
import { expectQuoteTripInPortal } from '@features/gateway-pg/helpers/quote-trip-verification';
import {
	cancelTravelFromNewSession,
	countCarrierPassengers,
	findCarrierPaxByEmail,
	resolveRegisteredQuoteContact,
	setHoldFromNewSession
} from '@features/gateway-pg/helpers/quote-session';

/** Solicitante de la cotización — colaborador EXISTENTE (eje de TC011..018). */
export type QuoteRequester = {
	firstName: string;
	lastName: string;
	/** Mail REGISTRADO del colaborador (vínculo por mail + selección de fila en la resolución API). */
	registeredEmail: string;
	/** Búsqueda API (lastName) para teléfono registrado + conteo de pax + precondición de tarjeta. */
	searchQuery: string;
	/** País del prefijo telefónico del widget. */
	country: string;
};

export type QuoteScenario = {
	requester: QuoteRequester;
	origin: string;
	destination: string;
	/** Nota del viaje (trazabilidad del TC en el portal). */
	note: string;
};

export type QuoteRunOptions = {
	/** Identificador que VINCULA al colaborador existente (eje teléfono/mail de la matriz). */
	linkBy: 'phone' | 'mail';
	/** Estado del hold del carrier durante el alta (off se restaura a ON en el finally). */
	hold: 'on' | 'off';
	/** true = tarjeta 3DS (challenge aprobado si se presenta); false = verifica que NO aparezca. */
	threeDs: boolean;
};

/**
 * Casilla yopmail sintética para el eje 'phone': debe NO estar registrada como pax del carrier
 * (si lo estuviera, la resolución por mail ganaría y el eje teléfono quedaría sin ejercitar) y
 * a la vez ser LEGIBLE (yopmail crea casillas on-demand — el mail de confirmación llega igual).
 * El flujo de vínculo NO registra este mail contra el pax (BE: getPassenger linkea al existente;
 * el mail ingresado queda solo en el registro de la quote) — no se acumula estado.
 */
const SYNTHETIC_PHONE_LINK_MAILBOX = 'magiis.quote.phone.link@yopmail.com';

/**
 * Teléfono sintético para el eje 'mail': cualquier número NO registrado sirve (la resolución por
 * mail gana incluso ante colisión — ver header). Formato AR del widget (grabación validada).
 */
const SYNTHETIC_UNREGISTERED_PHONE = '+54 (11) 5555-0147';

export class QuoteSteps extends UiBase {
	readonly quote: QuoteWidgetPage;
	readonly threeDs: ThreeDsChallengePage;

	constructor(options: TestContextOptions) {
		super(options);
		const opts = { page: this.page };
		this.quote = new QuoteWidgetPage(opts);
		this.threeDs = new ThreeDsChallengePage(opts);
	}

	/**
	 * Orquestador reusable del alta desde Quote para colaborador existente.
	 * Cubre linkBy phone/mail × hold ON/OFF × 3DS/no-3DS — las 8 variantes de §2 (TC011..018).
	 */
	async runColaboradorQuoteScenario(
		browser: Browser,
		scenario: QuoteScenario,
		options: QuoteRunOptions
	): Promise<void> {
		const { requester } = scenario;
		const defaults = journeyDefaultsFor('stripe');
		const card: GenericTestCard = resolveCard({
			gateway: 'stripe',
			intent: options.threeDs ? 'HAPPY_AUTH' : 'HAPPY_NO_AUTH'
		});
		let challengeSeen = false;
		let confirmToTravelId: number | null = null;
		let paxCountBefore: number | null = null;
		let quoteMailBaseline: number | null = null;

		// Contacto según el eje de vínculo (ver header — regla BE mail-primero/teléfono-fallback).
		let contactEmail = requester.registeredEmail;
		let contactPhone = SYNTHETIC_UNREGISTERED_PHONE;

		if (options.linkBy === 'phone') {
			await test.step('Precondición: la casilla sintética del eje teléfono NO debe estar registrada como pax', async () => {
				// Review MEDIUM-3 (anti-envenenamiento permanente del eje): si una corrida anterior
				// dejó un pax con la casilla sintética como mail REGISTRADO, la resolución del BE
				// (mail primero) ganaría SIEMPRE y el eje teléfono quedaría sin ejercitar para toda
				// corrida futura — con el spec en verde. Se rompe FUERTE (no skip): el dato está
				// envenenado y hay que limpiarlo, no esquivarlo.
				const rogues = await findCarrierPaxByEmail(
					browser,
					'stripe',
					requester.searchQuery,
					SYNTHETIC_PHONE_LINK_MAILBOX
				);
				expect(
					rogues,
					`Eje teléfono ENVENENADO: ${rogues.length} pax de la búsqueda "${requester.searchQuery}" tienen registrada la casilla sintética ${SYNTHETIC_PHONE_LINK_MAILBOX} ` +
						`(passengerUserId: ${rogues.map(row => row.passengerUserId ?? '?').join(', ')}). ` +
						'CLEANUP requerido antes de re-correr: eliminar ese pax duplicado del carrier TEST (o quitarle esa casilla) — mientras exista, la resolución por MAIL del BE gana siempre y el eje teléfono no se ejercita.'
				).toHaveLength(0);
			});

			await test.step('Precondición: resolver el teléfono REGISTRADO del colaborador vía API', async () => {
				const registered = await resolveRegisteredQuoteContact(
					browser,
					'stripe',
					requester.searchQuery,
					requester.registeredEmail
				);
				// Sin teléfono registrado el eje del TC no es medible: skip de precondición (misma
				// semántica que resolveCardFlow 'existing'), nunca inventar un número "registrado".
				test.skip(
					!registered.phone,
					`[quote-phone] Precondición: el colaborador ${requester.registeredEmail} debe tener teléfono registrado. ` +
						`El buscador de pax no lo expone (keys de la fila: ${registered.availableKeys.join(', ') || 'sin filas'}) — ` +
						'confirmar el campo real en la primera corrida (ver resolveRegisteredQuoteContact).'
				);
				contactPhone = registered.phone as string;
				contactEmail = SYNTHETIC_PHONE_LINK_MAILBOX;
			});
		}

		await test.step('Precondición: el solicitante no debe tener ya esta tarjeta (QUOTE-CARD-500)', async () => {
			// El widget registra la tarjeta contra el pax resuelto; re-registrar la misma responde
			// 500 y el caso moriría midiendo estado acumulado (hallazgo QUOTE-CARD-500).
			await clearQuoteRequesterCard(browser, {
				paxSearchQueries: defaults.paxSearchQueries,
				last4: card.last4,
				gateway: 'stripe'
			});
		});

		try {
			// El toggle de hold va PRIMERO DENTRO del try (review MEDIUM-2): cualquier fallo
			// posterior — incluida la precondición de conteo — debe pasar por el finally que
			// restaura hold=ON. Afuera del try, un fallo del propio toggle o entre el toggle y el
			// try dejaba el carrier compartido sin hold para el resto de la suite.
			await setHoldFromNewSession(browser, 'stripe', options.hold === 'on');

			await test.step('Precondición: conteo de pax que matchean la búsqueda (oráculo "usuario existente")', async () => {
				paxCountBefore = await countCarrierPassengers(browser, 'stripe', requester.searchQuery);
				expect(
					paxCountBefore,
					`La búsqueda "${requester.searchQuery}" debe resolver al colaborador existente ANTES del alta`
				).toBeGreaterThan(0);
			});

			await test.step('1. Abrir el widget público de cotización del carrier', async () => {
				await this.quote.goto({ language: 'EN' });
			});

			await test.step(`2. Fijar origen "${scenario.origin}" y destino "${scenario.destination}"`, async () => {
				await this.quote.setOrigin(scenario.origin);
				await this.quote.setDestination(scenario.destination);
			});

			await test.step('3. Fijar 1 pasajero (el widget nace en 0 y bloquea el avance)', async () => {
				await this.quote.setPassengerCount(1);
			});

			await test.step('4. Avanzar a selección de vehículo, nota y confirmación del vehículo', async () => {
				await this.quote.selectVehicle();
				await this.quote.setTripNote(scenario.note);
				await this.quote.confirmVehicle();
			});

			await test.step(`5. Completar contacto del colaborador (vínculo por ${options.linkBy === 'phone' ? 'TELÉFONO registrado' : 'MAIL registrado'})`, async () => {
				// Aun con el usuario registrado, el widget NO auto-completa: se llenan todos los
				// campos (verificado por QA en el precedente Authorize). TODO(live): eco del
				// teléfono registrado — el BE compara strings; si el formato guardado difiere del
				// que compone el widget (prefijo del país), el vínculo por teléfono no matchea y el
				// oráculo de conteo de pax lo delata (+1).
				await this.quote.fillContact({
					name: requester.firstName,
					lastName: requester.lastName,
					email: contactEmail,
					phone: contactPhone,
					country: requester.country
				});
			});

			await test.step('6. Solicitar la cotización', async () => {
				await this.quote.requestQuote();
			});

			await test.step(`7. Abrir el paso de pago y llenar la tarjeta (•••• ${card.last4})`, async () => {
				await this.quote.goToPayment();
				// Form NATIVO Angular para TODAS las pasarelas en el widget (ver header) — sin
				// 5º campo: gatewayConfig del carrier Stripe no exige ZIP/documento (TODO(live)).
				const form = new NativeAngularCardForm();
				await form.fill(this.page, card);
				await form.expectFilled(this.page, card);
			});

			await test.step(`Snapshot de frescura: mails de cotización ya presentes en ${contactEmail}`, async () => {
				// Review CRITICAL-1: la casilla yopmail es COMPARTIDA entre corridas y el link de un
				// mail viejo es idempotente ("Confirmed" sin viaje nuevo). El baseline se toma ANTES
				// de disparar el envío (paso 8) para poder exigir un mail NUEVO en el paso 9.
				quoteMailBaseline = await countQuoteMailsInInbox(this.page, contactEmail);
			});

			await test.step('8. Confirmar la cotización (aún NO crea el viaje)', async () => {
				await this.quote.confirmQuote();
			});

			if (options.threeDs) {
				await test.step('8b. Aprobar challenge 3DS si se presenta en el widget', async () => {
					if (await this.threeDs.waitForOptionalVisible(8_000)) {
						challengeSeen = true;
						await this.threeDs.completeSuccess();
						await this.threeDs.waitForHidden();
					}
				});
			} else {
				await test.step('8b. Verificar que no aparece modal 3DS en el widget', async () => {
					await expectNoThreeDSModal(this.page);
				});
			}

			await test.step('8c. El paso de pago debe cerrarse (form de tarjeta desmontado)', async () => {
				await expect(this.page.getByRole('textbox', { name: /Card number|N[uú]mero de tarjeta/i })).toHaveCount(
					0,
					{ timeout: 30_000 }
				);
			});

			await test.step('9. Confirmar el viaje desde el mail del solicitante → alta como PROGRAMADO', async () => {
				// REGLA DE NEGOCIO: el alta ocurre recién con el click del mail. La landing POSTea
				// `quotes/quote/{id}/confirmToTravel`, cuya respuesta trae el travelId
				// (BE ConfirmQuoteResponseDTO) — se captura vía el evento 'page' del contexto para
				// el cleanup, sin tocar el helper compartido.
				const context = this.page.context();
				const onPage = (newPage: Page) => {
					newPage.on('response', async response => {
						try {
							if (!/\/quotes\/quote\/\d+\/confirmToTravel/.test(response.url()) || !response.ok()) return;
							const body = (await response.json().catch(() => null)) as {
								travelId?: number;
								travelIdForCarrier?: number;
							} | null;
							const rawId = body?.travelId ?? body?.travelIdForCarrier;
							if (typeof rawId === 'number') {
								confirmToTravelId = rawId;
								console.log(`[quote-cleanup] Capturado travelId=${rawId} (confirmToTravel)`);
							}
						} catch {
							// Silencioso: la captura es solo para cleanup, no un oráculo.
						}
					});
				};
				context.on('page', onPage);

				try {
					const confirmPage = await confirmQuoteByMail(this.page, {
						email: contactEmail,
						// Candado anti-stale (review CRITICAL-1): exige un mail NUEVO respecto del
						// snapshot pre-envío — uno viejo de otra corrida no puede satisfacerlo.
						baselineCount: quoteMailBaseline ?? undefined,
						// El alta (y con hold ON, la retención) ocurre EN la landing: si el challenge
						// 3DS de Stripe se presenta ahí, se aprueba antes del assert de "Confirmed".
						approveChallengeIfPresent: async landing => {
							if (!options.threeDs) {
								await expectNoThreeDSModal(landing);
								return;
							}
							const landingChallenge = new ThreeDsChallengePage({ page: landing });
							if (await landingChallenge.waitForOptionalVisible(8_000)) {
								challengeSeen = true;
								await landingChallenge.completeSuccess();
								await landingChallenge.waitForHidden();
							}
						}
					});
					await expect(confirmPage).toHaveURL(/magiis/i);
					await confirmPage.close();
				} finally {
					context.off('page', onPage);
				}
			});

			if (options.threeDs && options.hold === 'off') {
				expect(
					challengeSeen,
					'Variante 3DS sin hold: el challenge DEBE haberse presentado en el widget o en la landing de confirmación — sin hold no hay oráculo de estado que detecte su ausencia (MEDIUM-3)'
				).toBe(true);
			}

			await test.step('10. Verificar el viaje en el portal del carrier (oráculo del caso)', async () => {
				await expectQuoteTripInPortal(browser, {
					requester: `${requester.firstName} ${requester.lastName}`,
					destination: scenario.destination,
					gateway: 'stripe',
					// Anclaje al viaje de ESTA corrida (review CRITICAL-1): sin el id, una fila
					// idéntica de una corrida anterior podía satisfacer el oráculo por texto.
					travelId: confirmToTravelId ?? undefined
				});
			});

			await test.step('11. Verificar que NO se creó un pasajero nuevo (vínculo al colaborador EXISTENTE)', async () => {
				const paxCountAfter = await countCarrierPassengers(browser, 'stripe', requester.searchQuery);
				expect(
					paxCountAfter,
					`El alta desde Quote debía VINCULAR al colaborador existente (${options.linkBy === 'phone' ? 'teléfono' : 'mail'} registrado), no crear un pax nuevo — el conteo de "${requester.searchQuery}" creció`
				).toBe(paxCountBefore as number);
			});
		} finally {
			if (confirmToTravelId !== null) {
				await test.step('Cleanup: cancelar el viaje creado desde Quote', async () => {
					await cancelTravelFromNewSession(browser, 'stripe', confirmToTravelId as number);
				});
			}
			if (options.hold === 'off') {
				await setHoldFromNewSession(browser, 'stripe', true);
			}
		}
	}
}
