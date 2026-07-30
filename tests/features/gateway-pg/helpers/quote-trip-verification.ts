/**
 * Verificación en el PORTAL de un viaje creado desde el widget público de cotización (Quote).
 *
 * PROBLEMA QUE RESUELVE — el flujo Quote atraviesa TRES contextos distintos:
 *   1. el widget público (anónimo, sin login),
 *   2. la casilla de mail del solicitante (yopmail) para confirmar el viaje,
 *   3. el portal del carrier (autenticado) donde el viaje debe aparecer.
 * El oráculo del caso vive en el (3), así que sin cruzar a una sesión autenticada un spec de Quote
 * sólo puede verificar que un formulario desapareció — que es lo que hacía TC1215 antes de esto.
 *
 * POR QUÉ UN CONTEXTO NUEVO y no la página del widget ni el popup del mail:
 *   · El popup de confirmación viene de un DOMINIO EXTERNO (yopmail) y arrastra la sesión anónima
 *     del widget. Navegarlo al portal mezcla dos sesiones conceptualmente distintas —anónima y
 *     autenticada— y una cookie residual puede alterar el comportamiento del portal. Ese tipo de
 *     fallo aparece tarde, es intermitente y se confunde con flakiness del producto.
 *   · `browser.newContext()` es la forma en que Playwright modela "otra sesión". Aislamiento real.
 *
 * POR QUÉ RECIBE `browser` Y NO `page`: hace explícito en la firma que este helper abre una sesión
 * nueva. Un helper que creara contextos a partir de `page` esconderia ese efecto.
 *
 * POR QUÉ ES UN HELPER Y NO UN BLOQUE EN EL SPEC: el área Quote tiene ~14 casos en la matriz
 * Authorize (§11) y ~20 en Stripe (§2), todos con el mismo cierre. Inline serían decenas de copias
 * que pueden divergir, y cuando se implemente BL-041 (auth como project dependency) habría que
 * tocarlas todas. Acá es un archivo.
 */

import type { Browser } from '@playwright/test';
import type { GatewayName } from '@fixtures/gateways/_shared';

import { test } from '@TestFixture';
import { loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { shortDestination } from '@features/gateway-pg/helpers/journey-url.helpers';
import { CarrierTravelManagementPage } from '@ui/carrier';

/**
 * Estados VÁLIDOS de la fila de un viaje creado desde Quote.
 *
 * Los viajes de cotización se dan de alta como PROGRAMADOS tras la confirmación por mail del
 * solicitante (regla confirmada por el líder de QA). Igual se aceptan los estados de viaje activo:
 * si un driver ya lo tomó, la fila puede haber avanzado. Lo que NO se acepta es "No autorizado" /
 * "En conflicto" — ése es el estado de pago fallido y debe romper.
 */
const QUOTE_TRIP_ROW_STATUS = /Viaje programado|Scheduled Trip|Buscando chofer|Searching Driver|En progreso|In Progress/i;

export type ExpectQuoteTripInPortalOptions = {
	/**
	 * Nombre a buscar en la grilla. Para un solicitante ya registrado es su nombre; para un
	 * INVITADO el portal lo muestra con el sufijo "(inv)" y en el detalle como "Guest …" — el match
	 * de la grilla es token-based, así que alcanza con nombre y apellido.
	 */
	requester: string;
	/** Destino del viaje. Se compara por el tramo corto (calle + número). */
	destination: string;
	/** Pasarela activa — define la cadena de credenciales del dispatcher. */
	gateway: GatewayName;
};

// `shortDestination()` (tramo corto de la dirección) se importa de `journey-url.helpers` — SoT única.

/**
 * Abre una sesión NUEVA del portal como dispatcher y verifica que el viaje del solicitante figure
 * en la grilla de gestión con un estado válido post-confirmación.
 *
 * Cierra el contexto siempre — también si la assertion falla — para no dejar sesiones abiertas.
 */
export async function expectQuoteTripInPortal(browser: Browser, options: ExpectQuoteTripInPortalOptions): Promise<void> {
	const { requester, destination, gateway } = options;

	await test.step(`Verificar en el portal que el viaje de "${requester}" quedó dado de alta`, async () => {
		// Sesión limpia: el widget es anónimo y el portal autenticado — no se comparten cookies.
		const portalContext = await browser.newContext();

		try {
			const portalPage = await portalContext.newPage();
			await loginAsDispatcher(portalPage, { gateway });

			const management = new CarrierTravelManagementPage({ page: portalPage });
			await management.goto();
			// Debería aparecer el viaje del solicitante con un estado post-confirmación válido.
			// Si cae en "En conflicto"/"No autorizado", el pago falló → escalar a dev.
			await management.expectPassengerInPorAsignar(requester, shortDestination(destination), QUOTE_TRIP_ROW_STATUS);
		} finally {
			await portalContext.close();
		}
	});
}
