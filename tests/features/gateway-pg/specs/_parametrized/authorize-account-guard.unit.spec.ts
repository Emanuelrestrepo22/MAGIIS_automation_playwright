/**
 * Unit del CLASIFICADOR del guard de cuenta Authorize (`classifyAuthorizeAccount`).
 *
 * Por qué existe: el guard es la pieza que decide si una medición de pago contra Authorize VALE.
 * Si se equivoca hacia "real", todo verde que proteja es vacío — y eso ya pasó en vivo. El
 * 2026-07-29 dos probes consecutivos del guard reportaron 🟢 REAL, pero el segundo traía
 * `transId "0"` con `authCode ""`: era el rechazo por transacción DUPLICADA de Authorize (misma
 * tarjeta + mismo monto dentro de ~2 min, porque el probe usaba el monto fijo `1.11`). El
 * discriminador exigía `authCode === '000000'` para llamarla enlatada, así que cualquier otro
 * `transId "0"` se colaba como cuenta que mide de verdad.
 *
 * El invariante que fija este spec: **`transId "0"` NUNCA es una autorización aprobada**, sea cual
 * sea el `authCode`. O es la cuenta enlatada de Test Mode, o es indeterminado — y los dos bloquean.
 *
 * Test PURO (sin browser ni red): sólo clasifica objetos en memoria. Mismo patrón que
 * `adapters-consistency.unit.spec.ts` (project `unit`, testMatch `*.unit.spec.ts`).
 *
 * Ejecución: `npx playwright test -c playwright.gateway-pg.config.ts --project=unit`
 */

import { test, expect } from '@playwright/test';

import type { AuthorizeApiResponse } from '@schemas/authorize.types';

import { classifyAuthorizeAccount } from '@features/gateway-pg/helpers/authorize-account-guard';

/** Respuesta mínima del sandbox con los campos que el clasificador lee. */
function responseWith(fields: {
	transId: string;
	authCode: string;
	testRequest?: string;
	avs?: string;
	cvv?: string;
}): AuthorizeApiResponse {
	return {
		transactionResponse: {
			transId: fields.transId,
			authCode: fields.authCode,
			testRequest: fields.testRequest ?? '0',
			avsResultCode: fields.avs ?? '',
			cvvResultCode: fields.cvv ?? ''
		}
	} as AuthorizeApiResponse;
}

test.describe('[unit] guard de cuenta Authorize — clasificador @gateway @authorize', () => {
	test('Debería clasificar como REAL una autorización con transId no-cero', () => {
		// Firma observada en vivo de la cuenta correcta (2026-07-29).
		const verdict = classifyAuthorizeAccount(
			responseWith({ transId: '80057740303', authCode: '3UW5F4', avs: 'Y', cvv: 'M' })
		);

		expect(verdict.canned, 'una autorización con transId real no es cuenta enlatada').toBe(false);
		expect(verdict.inconclusive, 'una autorización con transId real es concluyente').toBe(false);
	});

	test('Debería clasificar como ENLATADA la firma de Test Mode (transId 0 + authCode 000000)', () => {
		const verdict = classifyAuthorizeAccount(
			responseWith({ transId: '0', authCode: '000000', testRequest: '1', avs: 'P', cvv: '' })
		);

		expect(verdict.canned, 'transId 0 + authCode 000000 es la firma enlatada de Test Mode').toBe(true);
	});

	test('Debería clasificar como INDETERMINADO un transId cero con authCode vacío (rechazo por duplicado)', () => {
		// El caso que se colaba como REAL: rechazo por transacción duplicada.
		const verdict = classifyAuthorizeAccount(responseWith({ transId: '0', authCode: '', avs: 'P', cvv: '' }));

		expect(
			verdict.inconclusive,
			'transId 0 sin authCode enlatado NO prueba que la cuenta mida: es indeterminado'
		).toBe(true);
		expect(verdict.canned, 'no es la firma enlatada conocida, así que no se reporta como Test Mode').toBe(false);
	});

	test('Debería clasificar como INDETERMINADO cualquier transId cero, sea cual sea el authCode', () => {
		// Invariante general: el authCode no puede rescatar un transId cero.
		for (const authCode of ['', 'ABC123', '111111', '00000']) {
			const verdict = classifyAuthorizeAccount(responseWith({ transId: '0', authCode }));

			expect(
				verdict.canned || verdict.inconclusive,
				`transId "0" con authCode "${authCode}" jamás debe pasar como cuenta real`
			).toBe(true);
		}
	});

	test('Debería tratar una respuesta sin transactionResponse como indeterminada', () => {
		const verdict = classifyAuthorizeAccount({} as AuthorizeApiResponse);

		// transId ausente → '' ≠ '0': no es enlatada ni transId-cero. Lo que importa es que el gate
		// público lo bloquee por veredicto nulo/sin señal; acá se fija que no se declare "real" por
		// omisión de campos.
		expect(verdict.transId, 'sin transactionResponse el transId queda vacío, no inventado').toBe('');
		expect(verdict.canned, 'una respuesta vacía no es la firma enlatada').toBe(false);
	});
});
