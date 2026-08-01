/**
 * Precondición de tarjeta para los casos de Quote.
 *
 * POR QUÉ EXISTE — el widget de cotización es ANÓNIMO: tipea una tarjeta nueva y la registra
 * contra el pasajero resuelto por el mail del solicitante. Si ese pasajero YA tiene esa misma
 * tarjeta (la dejó una corrida anterior del mismo caso), el alta falla y el caso se cae en el paso
 * de pago con un mensaje genérico. El spec no puede limpiarla por sí mismo: la API de tarjetas
 * exige sesión AUTENTICADA y el widget no la tiene.
 *
 * HALLAZGO DE PRODUCTO asociado (medido en vivo 2026-07-30, apps-test, carrier 1521, pax 8669):
 * re-registrar una tarjeta ya existente responde
 *   `POST /magiis-v0.2/passengers/<id>/cards → 500`
 *   `java.lang.IllegalStateException: Expected a string but was BEGIN_OBJECT at line 1 column 55 path $.error`
 * es decir, MAGIIS no sabe deserializar el error que devuelve la pasarela (espera `error` string,
 * recibe objeto) y rompe con 500 + traza Java en el body, en vez de un 4xx controlado. La UI lo
 * traduce a "Card validation error. Please, check the data entered." — engañoso: los datos están
 * bien, la tarjeta está duplicada. Ver el RUN-LOG (hallazgo QUOTE-CARD-500).
 *
 * Esta precondición NO tapa ese hallazgo: lo deja documentado y aísla el caso de Quote para que
 * mida lo suyo (el alta del viaje) y no el estado acumulado de corridas previas — mismo criterio
 * que `cleanupGatewayCardByLast4` ya aplica en el área WAL y en la matriz de outcomes.
 */

import type { Browser } from '@playwright/test';
import type { GatewayName } from '@fixtures/gateways/_shared';

import { test } from '@TestFixture';
import { loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { cleanupGatewayCardByLast4 } from '@features/gateway-pg/helpers/card-precondition';

export type ClearQuoteRequesterCardOptions = {
	/** Queries de búsqueda del pasajero (API `getPassengerId`), en orden de intento. */
	paxSearchQueries: readonly string[];
	/** Últimos 4 dígitos de la tarjeta que el caso va a tipear en el widget. */
	last4: string;
	/** Pasarela activa — define la cadena de credenciales del dispatcher. */
	gateway: GatewayName;
};

/**
 * Abre una sesión autenticada NUEVA (el widget es anónimo) y borra del pasajero del solicitante
 * toda tarjeta con ese last4, para que el caso registre una tarjeta limpia.
 *
 * Cierra el contexto siempre, también si algo falla.
 */
export async function clearQuoteRequesterCard(browser: Browser, options: ClearQuoteRequesterCardOptions): Promise<void> {
	const { paxSearchQueries, last4, gateway } = options;

	await test.step(`Precondición: dejar al solicitante sin la tarjeta •••• ${last4}`, async () => {
		const context = await browser.newContext();
		try {
			const page = await context.newPage();
			await loginAsDispatcher(page, { gateway });
			await cleanupGatewayCardByLast4(page, paxSearchQueries, last4);
		} finally {
			await context.close();
		}
	});
}
