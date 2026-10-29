/**
 * [MG · área HOLD][DB] Viajes PROGRAMADOS — hold ~2h antes + cancelación DEVUELVE el dinero.
 * ============================================================================================
 *
 * Regla de negocio (viajes programados con hold):
 *   1. Al programar un viaje se hace un HOLD ~2h antes de la hora del viaje (dinero reservado).
 *   2. Si el viaje se CANCELA → el hold pasa a RELEASE → el dinero se devuelve al cliente.
 *   3. Si el viaje se COMPLETA → el hold pasa a CAPTURE → el dinero se cobra.
 *
 * Oráculo = capa DB Oracle (`MAGIIS.CARD_HOLDS` + `MAGIIS.TRAVEL`), NO `MGW.logs`: esa tabla vive
 * en la DB propia del microservicio gateway (MySQL) y es inaccesible desde la red local. CARD_HOLDS
 * es el equivalente Oracle y expone el ESTADO ESTRUCTURADO del hold (HOLD/RELEASE/CAPTURE), no un
 * log crudo. Helper: `oracle-holds.ts`. Mismo patrón que `epayment-idempotency/double-charge-db`.
 *
 * GATE: read-only (no muta nada) → solo requiere Oracle (ORACLE_*_TEST). Sin conexión → skip limpio.
 *
 * BINDING POR ENV:
 *   MG_SCHED_TRAVEL_ID        travelId de un viaje PROGRAMADO con hold para aseverar su ciclo por
 *                             viaje (sin él, ese test se salta; el invariante corre igual).
 *   MG_HOLD_MAX_HOURS_BEFORE  cota superior de horas hold→viaje (default 6; la regla es ≈2h, pero
 *                             la ventana real observada va ~2–3h; se asevera >0 y ≤ esta cota).
 *   ORACLE_HOLD_SETTLE_MIN    minutos de asentamiento del RELEASE async en el invariante (default 15).
 *
 * Traza: TS-EBIZ-TC1261 (Alta de Viaje programado + Hold ON) es el caso de matriz ancla; esta
 * verificación DB cubre el invariante de pago (cancelado ⇒ devuelto) que subyace a ese flujo.
 */

/* eslint-disable playwright/no-skipped-test */

import { test, expect } from '@TestBase';
import {
	oracleConfigFromEnv,
	readTripHold,
	findCancelledTripsWithUnreleasedHold,
	HOLD_STATUS
} from '@features/gateway-pg/helpers/oracle-holds';

const ORACLE = oracleConfigFromEnv();
const SCHED_TRAVEL_ID = process.env.MG_SCHED_TRAVEL_ID ?? '';
const HOLD_MAX_HOURS_BEFORE = Number(process.env.MG_HOLD_MAX_HOURS_BEFORE ?? 6);

test.describe(
	'[MG · HOLD][DB] viaje programado — hold + devolución al cancelar @gateway @hold @regression',
	{
		// Ancla de matriz: TS-EBIZ-TC1261 (viaje programado + Hold ON). El invariante de pago que
		// subyace (cancelado ⇒ dinero devuelto) no tiene MG key 1:1 → se ancla al TC del flujo.
		annotation: [{ type: 'tc', description: 'TS-EBIZ-TC1261' }]
	},
	() => {
		test.skip(!ORACLE, 'Sin conexión Oracle (ORACLE_*_TEST) — capa DB de la validación de holds.');

		test('[invariant] ningún viaje cancelado retiene el hold (cancelado ⇒ dinero devuelto)', async () => {
			const cfg = ORACLE!;
			const leaks = await findCancelledTripsWithUnreleasedHold(cfg);
			// Debería ser 0: al cancelar, el hold pasa a RELEASE. Cualquier fila = dinero retenido.
			expect(
				leaks,
				`Viajes cancelados con hold aún en STATUS='HOLD' (dinero NO devuelto): ${JSON.stringify(leaks)}. ` +
					'Al cancelar, el hold debe pasar a RELEASE. Cualquier fila = dinero retenido = hallazgo de producto.'
			).toHaveLength(0);
		});

		test('[programmed-hold] el viaje programado tiene hold antes del viaje + ciclo de estado válido', async () => {
			test.skip(
				!SCHED_TRAVEL_ID,
				'Setear MG_SCHED_TRAVEL_ID=<travelId de un viaje programado con hold> para aseverar su ciclo.'
			);
			const cfg = ORACLE!;
			const holds = await readTripHold(cfg, SCHED_TRAVEL_ID);
			expect(holds.length, `El viaje ${SCHED_TRAVEL_ID} no tiene fila en CARD_HOLDS`).toBeGreaterThan(0);
			const hold = holds[0];

			// Debería estar en un estado válido del ciclo del hold (HOLD/RELEASE/CAPTURE).
			expect(
				[HOLD_STATUS.HOLD, HOLD_STATUS.RELEASE, HOLD_STATUS.CAPTURE],
				`STATUS inesperado: ${hold.holdStatus}`
			).toContain(hold.holdStatus);

			// Debería ser un viaje programado (ISPROGRAMMED=1).
			expect(hold.isProgrammed, `El viaje ${SCHED_TRAVEL_ID} no es programado (ISPROGRAMMED≠1)`).toBe(true);

			// El hold debería crearse ANTES de la hora del viaje (regla: ~2h antes), dentro de la cota.
			expect(hold.hoursBeforeTrip, 'No se pudo calcular horas hold→viaje (falta TRAVEL_DATE)').not.toBeNull();
			const hoursBefore = hold.hoursBeforeTrip as number;
			expect(
				hoursBefore,
				`El hold se creó ${hoursBefore}h respecto del viaje; debería ser antes (>0) y ≤ ${HOLD_MAX_HOURS_BEFORE}h (esperado ≈2h).`
			).toBeGreaterThan(0);
			expect(
				hoursBefore,
				`hold→viaje ${hoursBefore}h excede la cota ${HOLD_MAX_HOURS_BEFORE}h`
			).toBeLessThanOrEqual(HOLD_MAX_HOURS_BEFORE);

			// Si el viaje fue CANCELADO, el hold DEBE estar liberado (dinero devuelto).
			if (hold.canceledBy) {
				expect(
					hold.holdStatus,
					`El viaje ${SCHED_TRAVEL_ID} fue cancelado por ${hold.canceledBy} pero el hold sigue en ${hold.holdStatus} (dinero no devuelto).`
				).toBe(HOLD_STATUS.RELEASE);
			}
		});
	}
);
