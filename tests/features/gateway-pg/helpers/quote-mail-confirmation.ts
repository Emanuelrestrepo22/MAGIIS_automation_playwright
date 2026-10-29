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
 * Nota de mantenimiento: los selectores `iframe[name="ifinbox"]` / `iframe[name="ifmail"]` y los
 * botones del toolbar (`#refresh` / `#delete`, usados best-effort) pertenecen a yopmail y pueden
 * cambiar sin aviso — son el único punto del helper que hay que revisar si rompe. Sólo funciona
 * con casillas @yopmail.com; otro dominio necesitaría su propio lector de bandeja.
 *
 * FRESCURA (review CRITICAL-1): las casillas son COMPARTIDAS entre corridas y acumulan mails
 * idénticos en remitente+asunto. El link viejo es IDEMPOTENTE (responde "Confirmed" aunque el
 * viaje sea de otra corrida), así que abrir "el primero que matchee" sin disciplina de frescura
 * produce un falso verde sin viaje nuevo. El candado: snapshot del conteo ANTES de disparar el
 * envío (`countQuoteMailsInInbox`) + exigir `count > baseline` después (`baselineCount`).
 */

import type { Page } from '@playwright/test';

import { expect, test } from '@TestFixture';

const YOPMAIL_URL = 'https://yopmail.com/';

/** Remitente del mail de confirmación de MAGIIS. */
const MAGIIS_SENDER = 'no-reply@magiis.com';

/**
 * Asunto del mail de cotización. El widget corre en EN (el idioma sale del query param), así que el
 * asunto llega en inglés. Si un caso futuro corre el widget en ES habrá que ampliarlo — no se
 * inventa la traducción acá sin haberla observado.
 */
const QUOTE_MAIL_SUBJECT = 'BOOK YOUR TRIP';

/**
 * TODOS los mails de cotización de MAGIIS en la bandeja de yopmail. Se resuelve en cada uso (no se
 * cachea) porque el iframe de la bandeja se re-renderiza al refrescar y un handle viejo apuntaría a
 * un nodo muerto. yopmail lista los mails más nuevos PRIMERO: `.first()` sobre este locator es "el
 * más reciente que matchea" — pero SÓLO es el de esta corrida si antes se verificó la frescura
 * (`baselineCount`, ver header).
 */
function magiisQuoteMails(page: Page) {
	return (
		page
			.locator('iframe[name="ifinbox"]')
			.contentFrame()
			// Se ancla al ASUNTO además del remitente: la casilla acumula muchos mails de
			// `no-reply@magiis.com` (notificaciones "Remises EEUU-trip-****" de otras corridas), y sólo
			// el de cotización trae el link de confirmación. Filtrar sólo por remitente abría el mail
			// equivocado y el fallo parecía "el link no existe".
			.getByRole('button', { name: new RegExp(`${MAGIIS_SENDER}\\s+${QUOTE_MAIL_SUBJECT}`, 'i') })
	);
}

/** Abre la bandeja de una casilla yopmail (landing → login → ver bandeja). */
async function openInbox(page: Page, inboxUser: string): Promise<void> {
	await page.goto(YOPMAIL_URL);
	await page.getByRole('textbox', { name: /Login/i }).fill(inboxUser);
	// El botón de "ver bandeja" de yopmail no tiene texto accesible (es un ícono).
	await page.getByRole('button', { name: '' }).first().click();
}

/**
 * Refresca la bandeja (best-effort, nunca lanza): yopmail no re-consulta la casilla solo. El botón
 * del toolbar (`#refresh`) es DOM de yopmail sin contrato — si no está, se intenta por nombre
 * accesible y, en el peor caso, el poll que lo invoca re-cuenta sin refrescar.
 */
async function refreshInboxBestEffort(page: Page): Promise<void> {
	try {
		const byId = page.locator('#refresh').first();
		if (await byId.count()) {
			await byId.click();
			return;
		}
		const byName = page.getByRole('button', { name: /refresh|actualizar/i }).first();
		if (await byName.count()) {
			await byName.click();
		}
	} catch {
		// Best-effort: el poll que lo invoca vuelve a contar igual.
	}
}

/**
 * Borra el mail actualmente ABIERTO en yopmail (best-effort, nunca lanza — la purga no es oráculo
 * y el DOM de yopmail puede cambiar sin aviso). Higiene de la casilla compartida: el mail ya
 * consumido deja de acumularse como candidato stale para corridas futuras.
 */
async function deleteOpenMailBestEffort(page: Page): Promise<void> {
	try {
		const byId = page.locator('#delete').first();
		const target = (await byId.count()) ? byId : page.getByRole('button', { name: /delete|borrar/i }).first();
		if (!(await target.count())) {
			console.warn(
				'[quote-mail] yopmail no expone un botón de borrado reconocible — el mail consumido queda en la casilla'
			);
			return;
		}
		await target.click({ timeout: 5_000 });
		console.log('[quote-mail] mail de confirmación consumido y purgado de la casilla (best-effort)');
	} catch (err) {
		console.warn('[quote-mail] purga best-effort del mail falló (no fatal):', err);
	}
}

/**
 * SNAPSHOT de frescura (review CRITICAL-1): cuenta los mails de cotización YA presentes en la
 * casilla, para tomarlo ANTES de disparar el envío y exigir `count > baseline` después. Abre una
 * página NUEVA del mismo contexto para no perder el estado del widget en `page`.
 */
export async function countQuoteMailsInInbox(page: Page, email: string): Promise<number> {
	const inboxUser = email.split('@')[0];
	const inboxPage = await page.context().newPage();
	try {
		await openInbox(inboxPage, inboxUser);
		// El conteo se toma recién cuando se ESTABILIZA (dos lecturas iguales consecutivas): contar
		// mientras el iframe de la bandeja todavía renderiza SUBESTIMA el baseline, y un baseline
		// corto reabre la puerta al mail stale que este snapshot existe para cerrar.
		let previous = -1;
		await expect
			.poll(
				async () => {
					const current = await magiisQuoteMails(inboxPage).count();
					const stable = current === previous;
					previous = current;
					return stable;
				},
				{
					message: `El conteo de mails de cotización en ${inboxUser}@yopmail.com no se estabilizó — no se puede fijar el baseline de frescura`,
					timeout: 20_000,
					intervals: [750, 1_000]
				}
			)
			.toBe(true);
		return previous;
	} finally {
		await inboxPage.close();
	}
}

export type ConfirmQuoteByMailOptions = {
	/**
	 * Casilla que recibió el mail. Se acepta el mail completo (`magiisquote@yopmail.com`) o sólo el
	 * usuario (`magiisquote`) — yopmail sólo necesita la parte local.
	 */
	email: string;
	/** Timeout de espera del mail en la bandeja. Default 60s (el envío no es inmediato). */
	timeout?: number;
	/**
	 * Conteo de mails de cotización YA presentes en la casilla ANTES de disparar el envío
	 * (tomarlo con `countQuoteMailsInInbox`). Con él, el helper exige un mail NUEVO
	 * (`count > baselineCount`) en vez de conformarse con "hay al menos uno" — el candado
	 * anti-stale del caso (review CRITICAL-1). Sin él (callers legacy) se conserva el
	 * comportamiento histórico de visibilidad.
	 */
	baselineCount?: number;
	/**
	 * Hook opcional invocado sobre la landing de confirmación DESPUÉS del goto y ANTES del assert
	 * de "Confirmed". Existe para Stripe 3DS (quote-colaborador, TS-STRIPE-P2-TC015..018): el alta
	 * del viaje —y con él un posible hold— ocurre recién en esta landing, así que si el challenge
	 * 3DS se presenta acá, bloquearía el assert de confirmación sin este punto de aprobación.
	 * Los flujos sin 3DS (Authorize) no lo pasan y conservan el comportamiento histórico exacto.
	 */
	approveChallengeIfPresent?: (confirmPage: Page) => Promise<void>;
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
		await openInbox(page, inboxUser);

		// Debería llegar el mail de MAGIIS con el link de confirmación. El envío no es inmediato,
		// así que se espera con timeout holgado antes de declarar que no llegó.
		if (typeof options.baselineCount === 'number') {
			// FRESCURA (review CRITICAL-1): con baseline pre-envío el oráculo es "hay MÁS mails que
			// antes" — un mail viejo de otra corrida no puede satisfacerlo. Entre lecturas se refresca
			// la bandeja best-effort (yopmail no re-consulta la casilla solo).
			const baseline = options.baselineCount;
			await expect
				.poll(
					async () => {
						const count = await magiisQuoteMails(page).count();
						if (count <= baseline) {
							await refreshInboxBestEffort(page);
						}
						return count;
					},
					{
						message: `No llegó un mail NUEVO de ${MAGIIS_SENDER} a ${inboxUser}@yopmail.com tras ${timeout / 1000}s (baseline pre-envío: ${baseline}) — el viaje de Quote NO se puede confirmar y por lo tanto NO se da de alta. Verificar el envío del lado de MAGIIS.`,
						timeout,
						intervals: [2_000, 3_000, 5_000]
					}
				)
				.toBeGreaterThan(baseline);
		} else {
			await expect(
				magiisQuoteMails(page).first(),
				`No llegó el mail de ${MAGIIS_SENDER} a ${inboxUser}@yopmail.com tras ${timeout / 1000}s — el viaje de Quote NO se puede confirmar y por lo tanto NO se da de alta. Verificar el envío del lado de MAGIIS.`
			).toBeVisible({ timeout });
		}
	});

	return test.step('Confirmar el viaje desde el link del mail', async () => {
		// yopmail lista los más nuevos PRIMERO: con la frescura garantizada por el baseline, la
		// primera entrada que matchea ES el mail recién llegado (sin baseline, comportamiento
		// histórico de los callers legacy).
		await magiisQuoteMails(page).first().click();

		// El CTA del mail es una IMAGEN sin texto accesible: `getByRole('link', {name:
		// /confirm_your_trip/i})` (la plantilla vieja) ya no matchea nada. Observado en vivo
		// 2026-07-30: el mail trae UN solo link, hacia `#/mv?bt=<token>&l=<idioma>&k=<pluginKey>`.
		const ctaLink = page.locator('iframe[name="ifmail"]').contentFrame().getByRole('link').first();
		const href = await ctaLink.getAttribute('href');

		expect(
			href,
			'El mail de cotización llegó pero su CTA no apunta a la app MAGIIS con un token de reserva ' +
				`(href="${href}") — sin ese link el solicitante no puede confirmar el viaje.`
		).toMatch(/magiis\.com\/#\/mv\?bt=\d+/i);

		// Se abre el href REAL del mail en una pestaña nueva en vez de depender del evento `popup`:
		// el CTA no declara target y el popup nunca llegaba. Es el mismo request que dispara el
		// click del usuario — no se saltea ningún paso ni se usa un atajo de backend.
		const confirmPage = await page.context().newPage();
		await confirmPage.goto(href as string, { waitUntil: 'domcontentloaded' });

		// Punto de aprobación 3DS (ver `ConfirmQuoteByMailOptions.approveChallengeIfPresent`).
		if (options.approveChallengeIfPresent) {
			await options.approveChallengeIfPresent(confirmPage);
		}

		// La landing debe resolver el token: o confirma el viaje ahora, o informa que ya estaba
		// confirmado (el link es idempotente). Un token inválido/expirado NO da ninguno de los dos.
		// El oráculo del caso NO es esta pantalla sino el viaje en el portal (paso siguiente del
		// spec); acá sólo se verifica que el link del mail sea funcional.
		await expect(
			confirmPage.getByText(/Confirmed|Confirmad[oa]/i).first(),
			'El link del mail no confirmó la reserva ni la reportó como ya confirmada — token roto o landing en error.'
		).toBeVisible({ timeout: 30_000 });

		// Higiene de la casilla compartida (review CRITICAL-1): purgar el mail ya consumido para
		// que no se acumule como candidato stale de corridas futuras. Best-effort, nunca fatal.
		await deleteOpenMailBestEffort(page);

		return confirmPage;
	});
}
