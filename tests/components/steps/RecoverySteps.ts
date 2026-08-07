/**
 * KATA Steps (orquestador de flujo) — Carrier · Recovery post-fallo 3DS (Stripe).
 *
 * DELEGA en el helper canónico `setupTravelWithFailed3DS`
 * (`features/gateway-pg/helpers/stripe/recovery.helpers.ts`), que implementa el flujo REAL
 * de DOS ventanas de challenge (fix 2026-08-06, corridas recovery/conflicto):
 *   1. "Validar" dispara un hold REAL → challenge de VALIDACIÓN (ventana 1) → se APRUEBA
 *      (fallarlo abortaría el alta: no hay viaje → no hay NO_AUTORIZADO).
 *   2. Envío (vehículo + enviar servicio) → challenge POST-ENVÍO (ventana 2) → se RECHAZA
 *      (FAIL) → el viaje queda en NO_AUTORIZADO ("En Conflicto").
 *   3. Oráculo del seed (FE v1.72.8): fila del viaje en Gestión de Viajes → "En Conflicto"
 *      con "No autorizado" (la ruta de detalle /travels/{id} fue ELIMINADA del producto —
 *      evidencia 2026-08-07); el id retornado sale del POST /travels capturado y la página
 *      queda posicionada en el dashboard de gestión.
 * Incluye además la limpieza de idempotencia BL-050 (3220 vinculada bloquea "Validar").
 *
 * La versión anterior de este Step DUPLICABA el flujo viejo de UNA ventana (submit → FAIL
 * del primer challenge → esperar redirect) y moría en `waitForURL(/\/travels\//)`.
 *
 * Authorize.net NO usa 3DS → este Step NO aplica a otros gateways.
 *
 * Convención KATA aplicada:
 *   - Extiende UiBase (usa `this.page`); orquesta → NO @atc directo: los @atc viven en los
 *     componentes que el helper compone (fillMinimum → MG-148, challenge 3DS → MG-152/153).
 *   - Import por alias (@features) — sin relativos nuevos.
 */

import { test } from '@TestFixture';
import { UiBase } from '@ui/UiBase';
import { setupTravelWithFailed3DS } from '@features/gateway-pg/helpers/stripe/recovery.helpers';

/** Datos mínimos del alta que deriva en el fallo 3DS recuperable. */
export type RecoveryScenario = {
	/** Cliente del viaje (opcional; app pax lo auto-asigna desde el pasajero). */
	client?: string;
	passenger: string;
	origin: string;
	destination: string;
	/**
	 * Query API (`lastName`) para la limpieza de idempotencia BL-050 del seed.
	 * Default del helper: última palabra del nombre del pasajero.
	 */
	apiSearchQuery?: string;
};

export class RecoverySteps extends UiBase {
	/**
	 * Crea un viaje con fallo 3DS RECUPERABLE: aprueba el challenge de VALIDACIÓN (ventana 1,
	 * si aparece), envía el alta y RECHAZA el challenge POST-ENVÍO (ventana 2) — el viaje
	 * queda en NO_AUTORIZADO, verificado en la fila de "En Conflicto" del dashboard (la
	 * página queda AHÍ; el detalle /travels/{id} ya no existe en el producto). Retorna el
	 * travelId del viaje creado (capturado del POST /travels).
	 */
	async setupFailedThreeDs(scenario: RecoveryScenario): Promise<string> {
		return test.step('Seed: alta + challenge post-envío RECHAZADO → NO_AUTORIZADO (helper canónico)', () =>
			setupTravelWithFailed3DS(this.page, scenario)
		);
	}
}
