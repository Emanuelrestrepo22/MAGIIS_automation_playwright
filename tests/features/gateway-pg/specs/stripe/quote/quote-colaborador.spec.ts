/**
 * TCs: TS-STRIPE-P2-TC011–TC018 (docs/gateway-pg/stripe/matriz_cases2.md §2 "Usuario Colaboradores")
 * Feature: Alta de Viaje desde Quote — usuario vinculado a COLABORADOR EXISTENTE (teléfono + mail)
 * Tags: @regression @quote @web-only
 *
 * Ejes de la matriz (§2.2 sin 3DS · §2.3 con 3DS): vínculo por TELÉFONO/MAIL registrado ×
 * Hold ON/OFF × con/sin 3D Secure. El tramo "Cobro desde App Driver" del título es la fase
 * mobile, fuera del alcance web (mismo recorte que la suite de hold — TC1301-1303).
 *
 * FLUJO + ORÁCULOS — ver `QuoteSteps.runColaboradorQuoteScenario` (widget público anónimo →
 * contacto del colaborador → tarjeta en form NATIVO → confirmación por MAIL, donde recién se
 * crea el viaje como PROGRAMADO → fila válida en el portal + conteo de pax sin crecer =
 * "vinculado a usuario EXISTENTE"). Precedente validado en vivo: TS-AUTHORIZE-TC1215.
 *
 * Actor: colaborador 'smith, Emanuel' (PASSENGERS.colaborador — fast car, tarjeta 4242 activa),
 * casilla registrada `emanuel.smith@yopmail.com` (evidencia: recordings contractor +
 * quote-mail-confirmation.ts — todos los usuarios de prueba viven en @yopmail para verificar
 * la entrega real del mail). El teléfono registrado se resuelve por API en runtime (no se
 * inventa — skip de precondición si el buscador de pax no lo expone).
 *
 * KATA conformance: test del fixture KATA (@TestFixture); orquestación en QuoteSteps (@steps);
 * ATC del área QUOTE pendiente de keys Xray propias (registry sin sección quote — key null =
 * no inventar; la annotation MG-361 del describe es el mapeo por área aceptado del header
 * original). FRAGILE/TODO(live): primera corrida valida widget con carrier Stripe, eco del
 * teléfono registrado y ventana real del challenge 3DS (ver header de QuoteSteps).
 */
import { test } from '@TestFixture';
import { QuoteSteps, type QuoteRunOptions, type QuoteScenario } from '@steps/index';
import { journeyDefaultsFor } from '@features/gateway-pg/data/journey-defaults';
import { PASSENGERS } from '@features/gateway-pg/data/passengers';

const env = process.env.ENV ?? 'test';
const STRIPE = journeyDefaultsFor('stripe');

/**
 * Colaborador EXISTENTE de fast car (eje del caso: el sistema debe VINCULARLO, no crear un pax).
 * El nombre va separado en nombre/apellido porque el widget los pide en campos propios; la
 * casilla es @yopmail.com porque el flujo exige confirmar el viaje por mail y el helper lee esa
 * bandeja (regla del proyecto — ver quote-mail-confirmation.ts).
 */
const COLABORADOR_REQUESTER = {
	firstName: 'Emanuel',
	lastName: 'Smith',
	registeredEmail: 'emanuel.smith@yopmail.com',
	searchQuery: PASSENGERS.colaborador.apiSearchQuery ?? 'smith',
	country: 'Argentina'
} as const;

function quoteScenario(note: string): QuoteScenario {
	return {
		requester: { ...COLABORADOR_REQUESTER },
		origin: STRIPE.origin,
		destination: STRIPE.destination,
		note
	};
}

// El widget es PÚBLICO: sin sesión previa (sin storageState del fixture multi-rol).
test.use({ storageState: { cookies: [], origins: [] } });
// Flujo largo (widget + yopmail + portal): mismo presupuesto que el precedente Authorize TC1215.
test.describe.configure({ mode: 'serial', timeout: 240_000 });

test.describe(
	`Gateway PG · Quote · Colaborador [${env.toUpperCase()}] @gateway @stripe @quote @hold @3ds @regression`,
	{ annotation: [{ type: 'tms', description: 'MG-361' }] },
	() => {
		test.describe('Via número de teléfono — sin 3DS', () => {
			test('[TS-STRIPE-P2-TC011] @regression @quote @hold quote colaborador teléfono hold+cobro', async ({
				page,
				browser
			}) => {
				await new QuoteSteps({ page }).runColaboradorQuoteScenario(
					browser,
					quoteScenario('TS-STRIPE-P2-TC011 quote colaborador telefono hold (automatizado)'),
					{ linkBy: 'phone', hold: 'on', threeDs: false } satisfies QuoteRunOptions
				);
			});

			test('[TS-STRIPE-P2-TC012] @regression @quote sin hold quote colaborador teléfono', async ({
				page,
				browser
			}) => {
				await new QuoteSteps({ page }).runColaboradorQuoteScenario(
					browser,
					quoteScenario('TS-STRIPE-P2-TC012 quote colaborador telefono sin hold (automatizado)'),
					{ linkBy: 'phone', hold: 'off', threeDs: false }
				);
			});
		});

		test.describe('Via mail — sin 3DS', () => {
			test('[TS-STRIPE-P2-TC013] @regression @quote @hold quote colaborador mail hold+cobro', async ({
				page,
				browser
			}) => {
				await new QuoteSteps({ page }).runColaboradorQuoteScenario(
					browser,
					quoteScenario('TS-STRIPE-P2-TC013 quote colaborador mail hold (automatizado)'),
					{ linkBy: 'mail', hold: 'on', threeDs: false }
				);
			});

			test('[TS-STRIPE-P2-TC014] @regression @quote sin hold quote colaborador mail', async ({
				page,
				browser
			}) => {
				await new QuoteSteps({ page }).runColaboradorQuoteScenario(
					browser,
					quoteScenario('TS-STRIPE-P2-TC014 quote colaborador mail sin hold (automatizado)'),
					{ linkBy: 'mail', hold: 'off', threeDs: false }
				);
			});
		});

		test.describe('Via número de teléfono — con 3DS', () => {
			test('[TS-STRIPE-P2-TC015] @regression @quote @3ds @hold quote colaborador teléfono hold+cobro 3DS', async ({
				page,
				browser
			}) => {
				await new QuoteSteps({ page }).runColaboradorQuoteScenario(
					browser,
					quoteScenario('TS-STRIPE-P2-TC015 quote colaborador telefono hold 3DS (automatizado)'),
					{ linkBy: 'phone', hold: 'on', threeDs: true }
				);
			});

			test('[TS-STRIPE-P2-TC016] @regression @quote @3ds sin hold quote colaborador teléfono 3DS', async ({
				page,
				browser
			}) => {
				await new QuoteSteps({ page }).runColaboradorQuoteScenario(
					browser,
					quoteScenario('TS-STRIPE-P2-TC016 quote colaborador telefono sin hold 3DS (automatizado)'),
					{ linkBy: 'phone', hold: 'off', threeDs: true }
				);
			});
		});

		test.describe('Via mail — con 3DS', () => {
			test('[TS-STRIPE-P2-TC017] @regression @quote @3ds @hold quote colaborador mail hold+cobro 3DS', async ({
				page,
				browser
			}) => {
				await new QuoteSteps({ page }).runColaboradorQuoteScenario(
					browser,
					quoteScenario('TS-STRIPE-P2-TC017 quote colaborador mail hold 3DS (automatizado)'),
					{ linkBy: 'mail', hold: 'on', threeDs: true }
				);
			});

			test('[TS-STRIPE-P2-TC018] @regression @quote @3ds sin hold quote colaborador mail 3DS', async ({
				page,
				browser
			}) => {
				await new QuoteSteps({ page }).runColaboradorQuoteScenario(
					browser,
					quoteScenario('TS-STRIPE-P2-TC018 quote colaborador mail sin hold 3DS (automatizado)'),
					{ linkBy: 'mail', hold: 'off', threeDs: true }
				);
			});
		});
	}
);
