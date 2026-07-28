/**
 * Guard de fidelidad — fixture eBizCharge ↔ doc oficial del sandbox.
 * ==================================================================
 *
 * Las 8 tablas de <https://developer.ebizcharge.net/connect/docs/test-credit-card-numbers>
 * quedan transcritas ACÁ como fixture literal (`DOC_*`), y el spec asserta que
 * `tests/fixtures/gateways/ebizcharge/cards.ts` no divierja de ellas.
 *
 * Por qué un guard y no solo un review: el fixture se pobló a mano leyendo la doc
 * (BL-027), y un número mal tipeado NO se manifiesta como fallo — se manifiesta como un
 * test que valida el outcome equivocado, o como un decline que el sandbox trata como
 * approved. Es la clase de defecto que ninguna corrida detecta.
 *
 * Regla de los dos ejes (ver `_shared/types.ts`):
 *   - Eje de NEGOCIO: approved / declines / referral / fraud / processing-delay →
 *     objetos completos en `EBIZ_TEST_CARDS`.
 *   - Eje de ANOTACIÓN: AVS / CVV2 / CAVV / Card Level → arrays `EBIZ_*_REFERENCE`.
 *     Son códigos de respuesta, NO outcomes de negocio: no se promueven a test case.
 *
 * Test PURO (sin browser): importa `test` plano de @playwright/test, project `unit`.
 *
 * Ejecución:
 *   npm run test:test:gateway:unit
 *   npx playwright test -c playwright.gateway-pg.config.ts --project=unit --grep "fidelidad"
 */
import { test, expect } from '@playwright/test';
import {
	EBIZ_TEST_CARDS,
	EBIZ_AVS_REFERENCE,
	EBIZ_CVV2_REFERENCE,
	EBIZ_CAVV_REFERENCE,
	EBIZ_CARD_LEVEL_REFERENCE,
	EBIZ_DEFAULT_EXPIRY,
	EBIZ_DECLINE_CVV,
	type EbizTestCard
} from '@fixtures/gateways/ebizcharge/cards';
import { EBIZ_CARDS } from '@fixtures/gateways/ebizcharge/card-policy';

// ═══════════════════════════════════════════════════════════════════════
// LA DOC — transcripción literal, tabla por tabla. NO editar sin abrir la doc.
// ═══════════════════════════════════════════════════════════════════════

/** Tabla `AVS Responses` — 17 filas. Todas approved con CVV2 M / CAVV A / Card Level A. */
const DOC_AVS: ReadonlyArray<[number: string, avs: string, cvc: string]> = [
	['4000100011112224', 'YYY', '123'],
	['4000100111112223', 'YYX', '321'],
	['4000100211112222', 'NYZ', '999'],
	['4000100311112221', 'NYW', '999'],
	['4000100411112220', 'YNA', '999'],
	['4000100511112229', 'NNN', '999'],
	['4000100611112228', 'XXW', '999'],
	['4000100711112227', 'XXU', '999'],
	['4000100811112226', 'XXR', '999'],
	['4000100911112225', 'XXS', '999'],
	['4000101011112222', 'XXE', '999'],
	['4000101111112221', 'XXG', '999'],
	['4000101211112220', 'YYG', '999'],
	['4000101311112229', 'GGG', '999'],
	['4000101411112228', 'YGG', '999'],
	['4000101511112227', 'NN', '999'],
	['4000101611112226', 'N/A', '999']
];

/** Tabla `CVV2 Responses` — 21 filas, CVV2 Code literal `any` en todas. */
const DOC_CVV2: ReadonlyArray<[number: string, brand: string, cvv2: string]> = [
	['4000200011112222', 'visa', 'M'],
	['4000200111112221', 'visa', 'N'],
	['4000200211112220', 'visa', 'P'],
	['4000200311112229', 'visa', 'S'],
	['4000200411112228', 'visa', 'U'],
	['4000200511112227', 'visa', 'X'],
	['5555444433332226', 'mastercard', 'M'],
	['5555444433332234', 'mastercard', 'N'],
	['5555444433332242', 'mastercard', 'P'],
	['5555444433332259', 'mastercard', 'S'],
	['5555444433332267', 'mastercard', 'U'],
	['5555444433332275', 'mastercard', 'X'],
	['371122223332225', 'amex', 'M'],
	['371122223332233', 'amex', 'n/a'],
	// AVS Response vacío en la doc + CVV2 Response = 'CVV2 No Match (Decline)'.
	['371122223332241', 'amex', 'no-match-decline'],
	['6011222233332224', 'discover', 'M'],
	['6011222233332232', 'discover', 'N'],
	['6011222233332240', 'discover', 'P'],
	['6011222233332257', 'discover', 'S'],
	['6011222233332265', 'discover', 'U'],
	['6011222233332273', 'discover', 'X']
];

/**
 * Tabla `Decline Responses` — 14 filas, CVV2 Code `999`.
 * La primera fila NO trae Decline Code (celda vacía) y su mensaje es `Declined`.
 * OJO fila 5: su expiración es `0922`, no `0930` — es dato de la doc, no un typo.
 */
const DOC_DECLINES: ReadonlyArray<[number: string, exp: string, code: string, message: string]> = [
	['4000300011112220', '0930', '', 'Declined'],
	['4000300001112222', '0930', '04', 'Pickup Card'],
	['4000300211112228', '0930', '05', 'Do not Honor'],
	['4000300311112227', '0930', '12', 'Invalid Transaction'],
	['4000300411112226', '0922', '15', 'Invalid Issuer'],
	['4000300511112225', '0930', '25', 'Unable to locate Record'],
	['4000300611112224', '0930', '51', 'Insufficient funds'],
	['4000300711112223', '0930', '55', 'Invalid Pin'],
	['4000300811112222', '0930', '57', 'Transaction Not Permitted'],
	['4000300911112221', '0930', '62', 'Restricted Card'],
	['4000301011112228', '0930', '65', 'Excess withdrawal count'],
	['4000301111112227', '0930', '75', 'Allowable number of pin tries exceeded'],
	['4000301211112226', '0930', '78', 'No checking account'],
	['4000301311112225', '0930', '97', 'Declined for CVV failure']
];

/** Tabla `Fraud Profiler Response` — 2 filas. */
const DOC_FRAUD: ReadonlyArray<[number: string, response: string]> = [
	['4000301411112224', 'review'],
	['4000301511112223', 'reject']
];

/** Tabla `Referral Response` — 1 fila, CVV2 Code `999`, sin AVS/CVV2/CAVV/Card Level. */
const DOC_REFERRAL: ReadonlyArray<[number: string, exp: string, cvc: string]> = [['4000300111112229', '0930', '999']];

/** Tabla `Slow Processing Cards` — 5 filas. */
const DOC_SLOW: ReadonlyArray<[number: string, seconds: number]> = [
	['4000000011112226', 5],
	['4000000011112234', 15],
	['4000000011112242', 30],
	['4000000011112259', 45],
	['4000000011112267', 60]
];

/** Tabla `CAVV Responses` — 12 filas, serie `4000600…`. */
const DOC_CAVV: ReadonlyArray<[number: string, cavv: string]> = [
	['4000600011112223', '1'],
	['4000600111112222', '2'],
	['4000600211112221', '3'],
	['4000600311112220', '4'],
	['4000600411112229', '6'],
	['4000600511112228', '7'],
	['4000600611112227', '8'],
	['4000600711112226', '9'],
	['4000600811112225', 'A'],
	['4000600911112224', 'B'],
	['4000601011112221', 'C'],
	['4000601111112220', 'D']
];

/** Tabla `Card Level Responses` — 20 filas, serie `4000700…`. */
const DOC_CARD_LEVEL: ReadonlyArray<[number: string, level: string]> = [
	['4000700011112221', 'A'],
	['4000700111112220', 'B'],
	['4000700211112229', 'C'],
	['4000700311112228', 'D'],
	['4000700411112227', 'G'],
	['4000700511112226', 'H'],
	['4000700611112225', 'I'],
	['4000700711112224', 'K'],
	['4000700811112223', 'S'],
	['4000700911112222', 'U'],
	['4000701011112229', 'G1'],
	['4000701111112228', 'G2'],
	['4000701211112227', 'J1'],
	['4000701311112226', 'J2'],
	['4000701411112225', 'J3'],
	['4000701511112224', 'J4'],
	['4000701611112223', 'K1'],
	['4000701711112222', 'S1'],
	['4000701811112221', 'S2'],
	['4000701911112220', 'S3']
];

/** Los 92 números de la doc, sin solapes entre tablas. */
const DOC_ALL_NUMBERS: readonly string[] = [
	...DOC_AVS.map(([n]) => n),
	...DOC_CVV2.map(([n]) => n),
	...DOC_DECLINES.map(([n]) => n),
	...DOC_FRAUD.map(([n]) => n),
	...DOC_REFERRAL.map(([n]) => n),
	...DOC_SLOW.map(([n]) => n),
	...DOC_CAVV.map(([n]) => n),
	...DOC_CARD_LEVEL.map(([n]) => n)
];

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

const CARDS = Object.values(EBIZ_TEST_CARDS) as readonly EbizTestCard[];

/**
 * Los números del fixture agrupados por su tabla de origen.
 *
 * OJO: el eje de negocio y el de anotación SE SOLAPAN a propósito en 4 números — son
 * filas de una tabla de anotación PROMOVIDAS a card de negocio porque su outcome sí
 * importa para MAGIIS (la approved default y las 3 de CVV2). Ese solape es correcto;
 * lo que no puede haber es un duplicado DENTRO de una misma tabla.
 */
function fixtureNumbersBySource(): Record<string, readonly string[]> {
	return {
		'EBIZ_TEST_CARDS': CARDS.map(c => c.number),
		'EBIZ_AVS_REFERENCE': EBIZ_AVS_REFERENCE.map(r => r.number),
		'EBIZ_CVV2_REFERENCE': EBIZ_CVV2_REFERENCE.map(r => r.number),
		'EBIZ_CAVV_REFERENCE': EBIZ_CAVV_REFERENCE.map(r => r.number),
		'EBIZ_CARD_LEVEL_REFERENCE': EBIZ_CARD_LEVEL_REFERENCE.map(r => r.number)
	};
}

/** Todos los números que el fixture conoce, deduplicados entre ejes. */
function fixtureNumbers(): string[] {
	return [...new Set(Object.values(fixtureNumbersBySource()).flat())];
}

/**
 * Las promociones anotación → negocio, pinneadas. Una promoción se justifica cuando la
 * fila SÍ tiene un outcome de negocio propio para MAGIIS; si aparece una novena, es una
 * decisión de diseño que hay que justificar acá (no un accidente).
 */
const PROMOCIONES_ESPERADAS: readonly string[] = [
	'4000100011112224', // AVS YYY → la approved default del fixture
	'4000100511112229', // AVS NNN → APPROVED_AVS_MISMATCH (aprueba con la dirección fallida)
	'4000200111112221', // CVV2 N  → CVV2_NO_MATCH
	'4000200211112220', // CVV2 P  → CVV2_NOT_PROCESSED
	'371122223332241', // CVV2 No Match (Decline) → DECLINE_AMEX_CVV2
	'5555444433332226', // CVV2 M de Mastercard → SUCCESS_MASTERCARD
	'371122223332225', // CVV2 M de Amex       → SUCCESS_AMEX (CVV de 4 dígitos)
	'6011222233332224' //  CVV2 M de Discover   → SUCCESS_DISCOVER
];

function cardByNumber(number: string): EbizTestCard | undefined {
	return CARDS.find(c => c.number === number);
}

/** Luhn — un número de tarjeta mal tipeado casi siempre rompe el checksum. */
function isLuhnValid(number: string): boolean {
	let sum = 0;
	let double = false;
	for (let i = number.length - 1; i >= 0; i--) {
		let digit = Number(number[i]);
		if (double) {
			digit *= 2;
			if (digit > 9) digit -= 9;
		}
		sum += digit;
		double = !double;
	}
	return sum % 10 === 0;
}

// ═══════════════════════════════════════════════════════════════════════
// SPECS
// ═══════════════════════════════════════════════════════════════════════

// Sin tag de pasarela a propósito: es un guard de DATOS, no un test de la pasarela. Con
// `@ebizcharge` se colectaba en los 3 projects del run por pasarela (10 tests × 3) y
// entraba al import Xray de MG-559 como tests unmapped. Corre en `:unit`.
test.describe('[unit] eBizCharge — fidelidad del fixture contra la doc oficial @gateway @unit @regression', () => {
	test('@unit cobertura: los 92 números documentados están en el fixture, sin extras', () => {
		// Las 8 tablas no se solapan → 92 números distintos.
		expect(new Set(DOC_ALL_NUMBERS).size).toBe(92);

		const fixture = new Set(fixtureNumbers());
		const faltantes = DOC_ALL_NUMBERS.filter(n => !fixture.has(n));
		expect(faltantes, `números de la doc ausentes del fixture: ${faltantes.join(', ')}`).toEqual([]);

		const doc = new Set(DOC_ALL_NUMBERS);
		const inventados = [...fixture].filter(n => !doc.has(n));
		expect(inventados, `números en el fixture que la doc NO respalda: ${inventados.join(', ')}`).toEqual([]);

		expect(fixture.size).toBe(92);
	});

	test('@unit todo número del fixture es Luhn-válido, sin duplicados dentro de su tabla', () => {
		// Duplicado DENTRO de una tabla = error de transcripción (dos filas al mismo número).
		for (const [fuente, numeros] of Object.entries(fixtureNumbersBySource())) {
			const repetidos = numeros.filter((n, i) => numeros.indexOf(n) !== i);
			expect(repetidos, `${fuente} repite: ${repetidos.join(', ')}`).toEqual([]);
		}

		const invalidos = fixtureNumbers().filter(n => !isLuhnValid(n));
		expect(invalidos, `números que no pasan Luhn: ${invalidos.join(', ')}`).toEqual([]);
	});

	test('@unit las promociones anotación → negocio son exactamente las esperadas', () => {
		const anotacion = new Set([
			...EBIZ_AVS_REFERENCE.map(r => r.number),
			...EBIZ_CVV2_REFERENCE.map(r => r.number),
			...EBIZ_CAVV_REFERENCE.map(r => r.number),
			...EBIZ_CARD_LEVEL_REFERENCE.map(r => r.number)
		]);
		const promovidas = CARDS.map(c => c.number).filter(n => anotacion.has(n));
		expect(promovidas.sort()).toEqual([...PROMOCIONES_ESPERADAS].sort());
	});

	test('@unit declines: los 14 pares código ↔ mensaje coinciden textualmente con la doc', () => {
		for (const [number, exp, code, message] of DOC_DECLINES) {
			const card = cardByNumber(number);
			expect(card, `decline ${number} ausente de EBIZ_TEST_CARDS`).toBeDefined();
			expect(card!.declineCode, `declineCode de ${number}`).toBe(code);
			expect(card!.declineMessage, `declineMessage de ${number}`).toBe(message);
			expect(card!.exp, `exp de ${number} (la doc fija ${exp})`).toBe(exp);
			expect(card!.cvc, `los declines usan CVV ${EBIZ_DECLINE_CVV}`).toBe(EBIZ_DECLINE_CVV);
			expect(card!.category, `${number} debe ser un outcome de rechazo`).toBe('declined');
		}

		// La excepción de expiración es real: 4000300411112226 va con 0922, el resto 0930.
		const excepcion = cardByNumber('4000300411112226');
		expect(excepcion!.exp).toBe('0922');
		expect(excepcion!.exp).not.toBe(EBIZ_DEFAULT_EXPIRY);
	});

	test('@unit AVS: 17 filas con su código y su CVV fijado por la doc', () => {
		expect(EBIZ_AVS_REFERENCE).toHaveLength(DOC_AVS.length);
		DOC_AVS.forEach(([number, avs, cvc], i) => {
			expect(EBIZ_AVS_REFERENCE[i].number, `fila AVS ${i}`).toBe(number);
			expect(EBIZ_AVS_REFERENCE[i].avs, `código AVS de ${number}`).toBe(avs);
			// La doc NO dice "any" en esta tabla: fija 123 / 321 / 999 por fila.
			expect(EBIZ_AVS_REFERENCE[i].cvc, `CVV que la doc fija para ${number}`).toBe(cvc);
		});
	});

	test('@unit CVV2: 21 filas por marca, incluido el n/a de Amex', () => {
		expect(EBIZ_CVV2_REFERENCE).toHaveLength(DOC_CVV2.length);
		DOC_CVV2.forEach(([number, brand, cvv2], i) => {
			expect(EBIZ_CVV2_REFERENCE[i].number, `fila CVV2 ${i}`).toBe(number);
			expect(EBIZ_CVV2_REFERENCE[i].brand, `marca de ${number}`).toBe(brand);
			expect(EBIZ_CVV2_REFERENCE[i].cvv2, `resultado CVV2 de ${number}`).toBe(cvv2);
		});
	});

	test('@unit CAVV y Card Level: 12 y 20 filas idénticas a la doc', () => {
		expect(EBIZ_CAVV_REFERENCE).toHaveLength(DOC_CAVV.length);
		DOC_CAVV.forEach(([number, cavv], i) => {
			expect(EBIZ_CAVV_REFERENCE[i].number).toBe(number);
			expect(EBIZ_CAVV_REFERENCE[i].cavv, `CAVV de ${number}`).toBe(cavv);
		});

		expect(EBIZ_CARD_LEVEL_REFERENCE).toHaveLength(DOC_CARD_LEVEL.length);
		DOC_CARD_LEVEL.forEach(([number, level], i) => {
			expect(EBIZ_CARD_LEVEL_REFERENCE[i].number).toBe(number);
			expect(EBIZ_CARD_LEVEL_REFERENCE[i].level, `Card Level de ${number}`).toBe(level);
		});
	});

	test('@unit fraud profiler, referral y slow processing con su outcome de negocio', () => {
		for (const [number, response] of DOC_FRAUD) {
			const card = cardByNumber(number);
			expect(card, `fraud ${number} ausente`).toBeDefined();
			expect(card!.category).toBe('fraud-profiler');
			expect(card!.profilerResponse, `profilerResponse de ${number}`).toBe(response);
		}

		for (const [number, exp, cvc] of DOC_REFERRAL) {
			const card = cardByNumber(number);
			expect(card, `referral ${number} ausente — es una tabla propia de la doc`).toBeDefined();
			// Referral NO es approved ni declined: es una cuarta clase de outcome.
			expect(card!.category).toBe('referral');
			expect(card!.exp).toBe(exp);
			expect(card!.cvc).toBe(cvc);
		}

		for (const [number, seconds] of DOC_SLOW) {
			const card = cardByNumber(number);
			expect(card, `slow ${number} ausente`).toBeDefined();
			expect(card!.category).toBe('processing-delay');
			expect(card!.processingTimeSec, `segundos de ${number}`).toBe(seconds);
		}
	});

	test('@unit largo de CVV por marca: Amex 4 dígitos, el resto 3', () => {
		for (const card of CARDS) {
			const esperado = card.brand === 'amex' ? 4 : 3;
			expect(card.cvc.length, `${card.number} (${card.brand}) debe llevar CVV de ${esperado} dígitos`).toBe(esperado);
		}
	});

	test('@unit el namespace EBIZ_CARDS solo expone tarjetas que existen en el registry', () => {
		const registry = new Set(CARDS);
		for (const [key, card] of Object.entries(EBIZ_CARDS)) {
			expect(registry.has(card as EbizTestCard), `EBIZ_CARDS.${key} no apunta a EBIZ_TEST_CARDS`).toBe(true);
		}

		// El decline de Amex por CVV2 NO puede quedar clasificado como anotación CVV2:
		// su outcome de negocio es rechazo (regla del eje de negocio).
		expect(EBIZ_CARDS.DECLINE_AMEX_CVV2.category).toBe('declined');
		// Las dos CVV2 que SÍ son anotación aprueban la transacción.
		expect(EBIZ_CARDS.CVV2_NO_MATCH.category).toBe('cvv2');
		expect(EBIZ_CARDS.CVV2_NOT_PROCESSED.category).toBe('cvv2');
	});
});
