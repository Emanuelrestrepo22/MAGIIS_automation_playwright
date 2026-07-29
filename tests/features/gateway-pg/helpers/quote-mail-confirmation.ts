/**
 * Confirmación por mail del viaje de cotización (Quote).
 *
 * REGLA DE NEGOCIO (confirmada por el líder de QA, 2026-07-27): **todo viaje que entra por el
 * widget público de cotización requiere que el solicitante lo confirme desde su casilla**. El click
 * en "Confirm your Quote" NO crea el viaje — MAGIIS envía un mail desde `no-reply@magiis.com` con un
 * link `confirm_your_trip`, y el alta se produce recién cuando el cliente lo clickea. Al confirmarlo,
 * el viaje se da de alta como **PROGRAMADO**.
 *
 * Aplica tanto al usuario ya registrado como al invitado (no registrado). Evidencia:
 * `recorded/authorize-quote-hold-usuario-invitado.recorded.ts`.
 *
 * POR QUÉ YOPMAIL — es una decisión DELIBERADA del proyecto, no un workaround: se usan casillas
 * @yopmail.com de prueba precisamente para **validar que los mails efectivamente lleguen**. La
 * entrega del mail es parte de lo que el caso verifica, no sólo el medio para llegar al viaje. Todos
 * los usuarios de prueba de la suite viven en ese dominio (`remises.eeuu@yopmail.com`,
 * `emanuel.smith@yopmail.com`, `magiisquote@yopmail.com`).
 *
 * ⚠️ NO reemplazar este paso por un atajo de backend (endpoint de test que devuelva el token, lectura
 * directa de DB, etc.): eliminaría justamente la cobertura que el caso busca — que el mail salga y
 * llegue. Si el helper falla, el diagnóstico correcto es distinguir entre "el mail no llegó" (hallazgo
 * REAL del producto, reportar) y "yopmail cambió su DOM" (mantenimiento del helper).
 *
 * Nota de mantenimiento: los selectores `iframe[name="ifinbox"]` / `iframe[name="ifmail"]` pertenecen
 * a yopmail y pueden cambiar sin aviso — son el único punto del helper que hay que revisar si rompe.
 * Sólo funciona con casillas @yopmail.com; otro dominio necesitaría su propio lector de bandeja.
 */

import type { Page } from '@playwright/test';

import { expect, test } from '@TestFixture';

const YOPMAIL_URL = 'https://yopmail.com/';

/** Remitente del mail de confirmación de MAGIIS. */
const MAGIIS_SENDER = 'no-reply@magiis.com';

/**
 * Entrada del mail de MAGIIS en la bandeja de yopmail. Se resuelve en cada uso (no se cachea) porque
 * el iframe de la bandeja se re-renderiza al refrescar y un handle viejo apuntaría a un nodo muerto.
 */
function magiisMailInInbox(page: Page) {
	return page
		.locator('iframe[name="ifinbox"]')
		.contentFrame()
		.getByRole('button', { name: new RegExp(MAGIIS_SENDER, 'i') })
		.first();
}

export type ConfirmQuoteByMailOptions = {
	/**
	 * Casilla que recibió el mail. Se acepta el mail completo (`magiisquote@yopmail.com`) o sólo el
	 * usuario (`magiisquote`) — yopmail sólo necesita la parte local.
	 */
	email: string;
	/** Timeout de espera del mail en la bandeja. Default 60s (el envío no es inmediato). */
	timeout?: number;
};

/**
 * Abre la casilla en yopmail, encuentra el mail de MAGIIS y clickea el link `confirm_your_trip`.
 *
 * Devuelve la **página nueva** que abre el link (el confirm se abre en un popup), ya lista para
 * seguir navegando. El caller es responsable de cerrarla si no la usa.
 */
export async function confirmQuoteByMail(page: Page, options: ConfirmQuoteByMailOptions): Promise<Page> {
	const inboxUser = options.email.split('@')[0];
	const timeout = options.timeout ?? 60_000;

	// Dos steps separados a propósito: si falla el PRIMERO, el mail no salió (hallazgo del producto,
	// hay que reportarlo); si falla el SEGUNDO, el mail llegó pero el link no funcionó o yopmail
	// cambió su DOM. Distinguirlos evita diagnosticar un bug de MAGIIS como mantenimiento y viceversa.
	await test.step(`Verificar que llegó el mail de confirmación a ${inboxUser}@yopmail.com`, async () => {
		await page.goto(YOPMAIL_URL);
		await page.getByRole('textbox', { name: /Login/i }).fill(inboxUser);
		// El botón de "ver bandeja" de yopmail no tiene texto accesible (es un ícono).
		await page.getByRole('button', { name: '' }).first().click();

		// Debería llegar el mail de MAGIIS con el link de confirmación. El envío no es inmediato,
		// así que se espera con timeout holgado antes de declarar que no llegó.
		await expect(magiisMailInInbox(page), `No llegó el mail de ${MAGIIS_SENDER} a ${inboxUser}@yopmail.com tras ${timeout / 1000}s — el viaje de Quote NO se puede confirmar y por lo tanto NO se da de alta. Verificar el envío del lado de MAGIIS.`).toBeVisible({ timeout });
	});

	return test.step('Confirmar el viaje desde el link del mail', async () => {
		await magiisMailInInbox(page).click();

		// El link de confirmación abre el viaje en una pestaña nueva.
		const confirmPagePromise = page.waitForEvent('popup');
		await page
			.locator('iframe[name="ifmail"]')
			.contentFrame()
			.getByRole('link', { name: /confirm_your_trip/i })
			.click();
		const confirmPage = await confirmPagePromise;
		await confirmPage.waitForLoadState('domcontentloaded');

		return confirmPage;
	});
}
