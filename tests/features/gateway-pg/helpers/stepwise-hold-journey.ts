/**
 * Journey de alta de viaje con hold, PASO A PASO con assertion en cada step.
 *
 * Cubre los caminos HAPPY y UNHAPPY con el mismo recorrido: el desenlace esperado lo determina el
 * INTENT de la tarjeta vía `OUTCOME_BY_INTENT` (`journey-outcome.ts`), no la pasarela ni el spec.
 *   · `trip-created`       → el journey completa los 13 pasos y verifica "Por asignar".
 *   · `card-rejected`      → corta en el paso 10 (la pasarela declina el hold de vinculación) y
 *                            verifica que el alta NO avanza y que no se creó viaje.
 *   · `trip-unauthorized`  → completa el alta y verifica "En conflicto" / "No autorizado".
 * Un spec unhappy no pasa flags de comportamiento: cambia el intent y el resto se deriva.
 *
 * Forma pedida por el líder de QA (2026-07-27) para la campaña Authorize Ola A: en vez de
 * delegar el journey completo a `CarrierHoldSteps.runHoldScenario` (caja negra), cada paso
 * del flujo lleva su propia verificación, de modo que el step que falla identifique el punto
 * exacto sin abrir el trace. Los `test.step` se reportan con su nombre desde acá, así que cada
 * spec consumidor sigue mostrando sus pasos en el reporte.
 *
 * ── DOS EJES OPT-IN (`holdMode`, `cardFlow`) ─────────────────────────────────────────────────
 * Ambos son OPCIONALES y su ausencia reproduce el comportamiento histórico byte a byte: sin
 * `holdMode` no se emite ningún paso de toggle, y sin `cardFlow` el journey ejercita el alta de
 * tarjeta NUEVA de siempre. Los pasos se numeran en el ORDEN EN QUE SE EMITEN (contador), así que
 * el camino default sigue reportando 1..13 con los mismos títulos.
 *
 *   · `holdMode: 'on'`  → ASEVERA (sin escribir) que la pre-autorización está activa. Cierra la
 *     deuda histórica: al no aseverar el toggle, un carrier con hold en OFF hacía pasar estos
 *     specs igual (sin hold el viaje también queda "Por asignar") y se acreditaba un TC "Hold ON"
 *     ejecutando en realidad el escenario Hold OFF.
 *   · `holdMode: 'off'` → APAGA el toggle vía API y lo RESTAURA en el `finally`. Es una operación
 *     DESTRUCTIVA sobre el carrier COMPARTIDO (1521), así que exige el mismo guard explícito que
 *     la suite CFG (`GATEWAY_ALLOW_DESTRUCTIVE_SWITCH=true`, `isGatewayDestructiveSwitchAllowed`)
 *     y skipea limpio sin él. Sin restore, una corrida Hold OFF envenena a TODA spec de hold
 *     posterior — por eso el restore corre incluso si el journey falla o si el caso skipea a mitad.
 *   · `cardFlow: 'existing'` → NO borra la tarjeta guardada: la SELECCIONA. Con la tarjeta ya
 *     vinculada no hay hold de vinculación, así que los pasos de fill + "Validar" no se emiten.
 *     Si el pasajero no la tiene vinculada el caso SKIPEA (precondición no satisfecha) en vez de
 *     vincularla: el seed es otro TC de la matriz (TS-AUTHORIZE-TC1051 / TS-EBIZ-TC1058), y
 *     vincularla acá convertiría el caso en el de tarjeta nueva — justamente lo que debe distinguir.
 *
 * ⚠️ El toggle se fija sobre el carrier de `parameters-api` (`CARRIER_ID` ?? 1521), que NO es el
 * carrier ARG de Mercado Pago. `holdMode` sólo es seguro para las pasarelas del carrier 1521
 * (Authorize / eBizCharge). No hay dato verificado del carrier de MP: no se inventa acá.
 *
 * Sí gestiona el cleanup: captura el `travelId` del `POST /travels` y cancela el viaje en un
 * `finally`, para no dejar residuos en el carrier compartido que contaminen la assertión final.
 *
 * Pasarelas soportadas: las de form NATIVO Angular (`adapter.cardForm === 'native-angular'`)
 * — Authorize / eBizCharge / Mercado Pago. Stripe usa Elements (3 iframes) y su propio flujo
 * `fillMinimum`/`selectCardByLast4`; no pasa por acá.
 *
 * BL-050 — PRECONDICIÓN de tarjeta duplicada: si el MISMO NÚMERO ya está vinculado al pasajero, el
 * botón "Validar" **NO se habilita** (y el form de tarjeta nueva no se renderiza), así que hay que
 * eliminar esa tarjeta antes de adicionarla. Lo resuelve el paso 8 con
 * `selectPreauthorizedCardMethod()`, que modela las DOS ramas de las grabaciones validadas —
 * ver su JSDoc en `CarrierNewTravelPage`. La unicidad es por NÚMERO, no por titular.
 *
 * ⚠️ REGLA DE NEGOCIO — EL HOLD SE APLICA DOS VECES (confirmado por el líder de QA, 2026-07-27):
 *   1. **Hold de vinculación** — al hacer click en "Validar"/"Valid" sobre la tarjeta nueva.
 *      El botón NO es una simple validación de formato: dispara una transacción contra la pasarela.
 *      Por eso el paso 10 puede fallar con "Error al validar tarjeta. Por favor, revise los datos
 *      ingresados." incluso con los 5 campos correctamente completados.
 *   2. **Hold del viaje** — al dar de alta el viaje, por el monto de la tarifa.
 * Un alta con tarjeta nueva genera DOS transacciones en la pasarela, no una.
 *
 * ✅ BL-051 RESUELTO (2026-07-28, evidencia del dashboard del sandbox): el hold de vinculación **se
 * anula automáticamente** (queda `Voided`, sin monto) 8-9 segundos antes del hold del viaje
 * (`Authorized`, con la tarifa completa). NO hay holds huérfanos sobre los fondos del cliente.
 */

import type { Page } from '@playwright/test';
import type { CardIntent, GatewayName } from '@fixtures/gateways/_shared';

import { expect, test } from '@TestFixture';
import { resolveCard } from '@fixtures/gateways/_shared';
import { debugLog } from '@helpers/index';
import { journeyDefaultsFor } from '@features/gateway-pg/data/journey-defaults';
import { loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { getGatewayPgAdapter } from '@features/gateway-pg/helpers/adapters';
import { cleanupCardsByLast4 } from '@features/gateway-pg/helpers/card-precondition';
import { outcomeForIntent, type JourneyOutcome } from '@features/gateway-pg/helpers/journey-outcome';
import { readHoldEnabled, setHoldViaApi } from '@features/gateway-pg/helpers/parameters-api';
import { cancelTravelIfCreated, captureCreatedTravelId } from '@features/gateway-pg/helpers/travel-cleanup';
import { CarrierNewTravelPage, CarrierTravelManagementPage, isGatewayDestructiveSwitchAllowed } from '@ui/carrier';
import { cardFormFor } from '@ui/carrier/card-forms';

/**
 * Primera parte del destino (calle + número). La grilla de gestión y el autocomplete NO
 * devuelven el mismo sufijo de localidad que el string canónico de `JOURNEY_DEFAULTS`, y el
 * match de fila es token-based — pasar el string completo haría fallar el filtro.
 * Espeja `shortDestination()` de `CarrierHoldSteps`.
 */
function shortDestination(destination: string): string {
	return destination.split(',')[0].trim();
}

/**
 * Estados VÁLIDOS de la fila después de un hold aprobado.
 *
 * El estado NO es determinista. Los tres valores que acreditan un hold aprobado:
 *   · "Buscando chofer" / "Searching Driver" — ningún driver tomó el viaje todavía.
 *   · "En progreso" / "In Progress"          — un driver YA lo aceptó (observado en el flujo
 *     contractor: si nadie lo hubiera aceptado, quedaría en Buscando chofer).
 *   · "Viaje programado" / "Scheduled Trip"  — viaje PROGRAMADO, el estado de los que entran por
 *     el widget de cotización (Quote), que se dan de alta como programados tras la confirmación
 *     por mail del solicitante.
 * Todos confirmados por el líder de QA (2026-07-27) con pago exitoso desde la App Driver.
 *
 * Fijar un literal introduce una condición de carrera entre la creación del viaje y la lectura de
 * la grilla, y haría fallar el test por algo que no es un bug.
 *
 * Bilingüe: el portal del spec queda en ES por `ensureSpanishLanguage`, pero una sesión manual
 * puede estar en inglés (puente de BL-048).
 *
 * NO incluye "No autorizado" / "En conflicto" — ése es el estado de hold FALLIDO y debe romper.
 *
 * "Chofer Asignado" / "Driver Assigned" (agregado 2026-07-29, evidencia en vivo: viaje 3650-W,
 * carrier 1521): es la MISMA carrera que este comentario describe, disparada por correr con el
 * pickup dentro de la geocerca del teléfono driver físico — hay un conductor real disponible a
 * metros, así que el viaje salta de "Buscando chofer" a asignado antes de que la grilla se lea.
 * Es un estado ESTRICTAMENTE POSTERIOR del mismo flujo exitoso (el hold ya fue aprobado y el
 * viaje está vivo), no una relajación: los estados de fallo siguen fuera y siguen rompiendo.
 */
const HOLD_APPROVED_ROW_STATUS =
	/Buscando chofer|Searching Driver|En progreso|In Progress|Viaje programado|Scheduled Trip|Chofer Asignado|Driver Assigned/i;

/**
 * Eje "toggle de pre-autorización" del journey. `undefined` (default) = el motor NI fija NI
 * asevera el toggle: comportamiento histórico, precondición declarada del spec.
 */
export type HoldMode = 'on' | 'off';

/** Eje "flujo de tarjeta" del journey. Default `'new'` (alta de tarjeta nueva, histórico). */
export type StepwiseCardFlow = 'new' | 'existing';

export type StepwiseHoldJourneyInput = {
	gateway: GatewayName;
	/** Intent canónico de la tarjeta (`resolveCard`). Default 'HAPPY_NO_AUTH'. */
	intent?: CardIntent;
	/** Cliente del alta de viaje. */
	client: string;
	/**
	 * Pasajero del alta. Si es igual a `client`, se asume que el cliente AUTO-ASIGNA el
	 * pasajero (empresa individuo, cliente individuo MP) y NO se toca el campo — el POM
	 * legacy falla si está deshabilitado.
	 */
	passenger: string;
	origin: string;
	destination: string;
	/**
	 * Nombre a buscar en la grilla de gestión. Para empresa individuo la grilla muestra al
	 * CLIENTE titular en formato "apellido, nombre" y no al sub-pasajero (BL-003), así que
	 * puede diferir de `passenger`. Default: `passenger`.
	 */
	expectInGrid?: string;
	/**
	 * Fija el titular de la tarjeta. Default: el canónico de la fixture. El titular es un campo
	 * INERTE en Authorize (el outcome lo determina CVV+ZIP), así que sólo tiene sentido pasarlo
	 * para reproducir un caso puntual — la unicidad que exige la wallet es por NÚMERO y se
	 * resuelve borrando la tarjeta vinculada (paso 7).
	 */
	holderName?: string;
	/**
	 * Desenlace esperado del journey. Default: el que `OUTCOME_BY_INTENT` tenga registrado para el
	 * intent (`journey-outcome.ts`), así los casos happy no declaran nada y los unhappy heredan la
	 * política sin repetirla por spec.
	 *
	 * Pasarlo explícito sirve para el caso legítimo en que el MISMO intent tenga desenlaces
	 * distintos por contexto (ej. una pasarela cuya cuenta todavía no tiene el filtro configurado):
	 * ahí el spec declara qué espera, con el motivo escrito al lado.
	 */
	expectOutcome?: JourneyOutcome;
	/**
	 * Eje del toggle de pre-autorización del carrier. OMITIDO = histórico: el motor no lo toca ni
	 * lo asevera. Ver el docblock del módulo ('on' asevera; 'off' apaga + restaura + exige guard).
	 */
	holdMode?: HoldMode;
	/**
	 * Eje del flujo de tarjeta. Default `'new'` (borra la guardada y da de alta una nueva, BL-050).
	 * `'existing'` selecciona la tarjeta YA vinculada y omite fill + "Validar"; skipea si el
	 * pasajero no la tiene.
	 */
	cardFlow?: StepwiseCardFlow;
};

/**
 * Ejecuta el journey completo con verificación por paso: verifica el viaje en la columna
 * "Por asignar" y luego lo cancela (cleanup en `finally`, también si algún paso falló).
 */
export async function runStepwiseHoldJourney(page: Page, input: StepwiseHoldJourneyInput): Promise<void> {
	const { gateway, client, passenger, origin, destination } = input;
	const intent: CardIntent = input.intent ?? 'HAPPY_NO_AUTH';
	const gridName = input.expectInGrid ?? passenger;
	// Comportamiento esperado: constante entre pasarelas, derivado del INTENT (no del gateway).
	const outcome: JourneyOutcome = input.expectOutcome ?? outcomeForIntent(intent);
	const holdMode = input.holdMode;
	const cardFlow: StepwiseCardFlow = input.cardFlow ?? 'new';

	// Guard DESTRUCTIVO — el mismo que la suite CFG (`gateway-config.factory.ts`): apagar el hold
	// escribe sobre los parámetros del carrier COMPARTIDO. Va ANTES de abrir el browser para que el
	// caso skipee sin consumir sesión, y vive en el MOTOR (no sólo en la factory) para que ningún
	// consumidor directo pueda mutar el carrier sin habilitarlo explícito.
	if (holdMode === 'off') {
		test.skip(!isGatewayDestructiveSwitchAllowed(), 'Caso DESTRUCTIVO (apaga la pre-autorización del carrier compartido 1521 y la restaura al final): ' + 'requiere GATEWAY_ALLOW_DESTRUCTIVE_SWITCH=true explícito (alias legacy AUTHORIZE_ALLOW_DESTRUCTIVE_SWITCH). ' + 'Correr SOLO en ventana exclusiva — con specs de hold concurrentes el toggle apagado las haría fallar.');
	}

	// Con la tarjeta ya vinculada NO hay hold de vinculación, así que no hay rechazo que aseverar:
	// el único desenlace que este flujo modela es el happy. Lanza en vez de aseverar un oráculo que
	// nadie observó (misma regla que `outcomeForIntent`).
	if (cardFlow === 'existing' && outcome !== 'trip-created') {
		throw new Error(`runStepwiseHoldJourney: cardFlow 'existing' sólo modela el desenlace 'trip-created' y se pidió '${outcome}' (intent '${intent}'). Con la tarjeta YA vinculada el paso "Validar" no se ejecuta, así que no hay hold de vinculación que la pasarela pueda declinar — el desenlace de un decline sobre tarjeta guardada NO está verificado. Observar una corrida real antes de modelarlo.`);
	}

	const adapter = getGatewayPgAdapter(gateway);
	// Queries de búsqueda del pax por pasarela — las consume la precondición API del paso 2.
	const defaults = journeyDefaultsFor(gateway);
	const resolved = resolveCard({ gateway, intent });
	// Titular: el canónico de la fixture. La unicidad que exige Authorize es por NÚMERO de
	// tarjeta y se resuelve BORRANDO la tarjeta vinculada en el paso 7 (BL-050), no variando el
	// titular — que es un campo inerte. `holderName` / `AUTHORIZE_CARD_HOLDER` quedan sólo como
	// override para reproducir un caso puntual (espeja el override por env de Stripe, `4b4d45b`).
	const holderName = input.holderName ?? process.env.AUTHORIZE_CARD_HOLDER ?? resolved.holderName;
	const card = { ...resolved, holderName };
	const travel = new CarrierNewTravelPage({ page });
	const management = new CarrierTravelManagementPage({ page });
	// Cliente que auto-asigna pasajero (empresa individuo / individuo MP): mismo valor.
	const autoAssignsPassenger = client === passenger;
	// Listener del POST /travels: se engancha ANTES de navegar para no perder la respuesta.
	// Da identidad al viaje (paso 11) y habilita el cleanup del `finally`.
	const travelRef = await captureCreatedTravelId(page);
	/**
	 * Valor del toggle de hold ANTES de que este journey lo apagara, o `null` si no lo mutó.
	 * Sólo se setea cuando efectivamente hubo cambio: con el toggle ya en OFF no hay nada que
	 * restaurar y una escritura de más sobre el carrier compartido es riesgo gratis.
	 */
	let holdToRestore: boolean | null = null;
	/**
	 * Numeración de pasos por ORDEN DE EMISIÓN. Los ejes opt-in agregan o quitan pasos, así que
	 * fijar el número en el título produciría huecos ("…9…12") que se leen como un bug del reporte.
	 * El camino default emite exactamente los mismos 13 títulos que antes.
	 */
	let stepIndex = 0;
	const step = async (title: string, body: () => Promise<void>): Promise<void> => {
		stepIndex += 1;

		await test.step(`${stepIndex}. ${title}`, body);
	};

	try {
		await runJourneySteps();
	} finally {
		// Cancelar el viaje creado, SIEMPRE. Sin esto cada corrida deja un viaje activo en el
		// carrier compartido 1521, y la assertion del paso 12 —que filtra por pasajero+destino,
		// constantes entre corridas— podría matchear ese residuo y reportar PASS con el hold roto.
		// `cancelTravelIfCreated` es no-op si no se capturó ningún id y nunca lanza.
		await cancelTravelIfCreated(page, travelRef);
		// Restaurar el toggle, SIEMPRE — también si el journey falló o si el caso skipeó a mitad
		// (precondición de tarjeta existente no satisfecha). Dejar el carrier compartido en OFF
		// envenena a toda spec de hold posterior, que fallaría por un motivo que no es suyo.
		await restoreHoldIfMutated();
	}

	/**
	 * Devuelve el toggle a su valor previo. NO lanza: si lanzara desde el `finally` taparía el
	 * error real del journey, que es lo que hay que leer primero. El fallo se grita por consola
	 * (no por `debugLog`, que puede estar apagado) porque deja el carrier compartido inconsistente
	 * y alguien tiene que arreglarlo a mano antes de la próxima corrida.
	 */
	async function restoreHoldIfMutated(): Promise<void> {
		if (holdToRestore === null) {
			return;
		}

		const target = holdToRestore;
		holdToRestore = null;

		try {
			await test.step(`Cleanup: restaurar la pre-autorización del carrier a ${target ? 'ON' : 'OFF'}`, async () => {
				await setHoldViaApi(page, target);
				// Debería quedar como estaba: verificarlo es el punto del restore, no sólo postearlo.
				expect(await readHoldEnabled(page), 'El toggle de pre-autorización no volvió a su valor previo tras el restore.').toBe(target);
			});
		} catch (error) {
			console.error(`[stepwise-hold-journey] ⚠️ NO SE PUDO RESTAURAR la pre-autorización a ${target ? 'ON' : 'OFF'} en el carrier compartido: ${(error as Error).message}\n` + 'El carrier queda INCONSISTENTE y las specs de hold siguientes van a fallar por este motivo, no por el suyo. Restaurarlo a mano (Configuración Parámetros → Aplicar Pre-Autorización) antes de la próxima corrida.');
		}
	}

	async function runJourneySteps(): Promise<void> {
		await step(`Login como dispatcher del carrier (creds chain ${gateway})`, async () => {
			await loginAsDispatcher(page, { gateway });
			// Debería alcanzar el shell del portal carrier (no quedarse en /authentication/login).
			await expect(page).not.toHaveURL(/\/authentication\/login/);
		});

		if (holdMode) {
			await step(`Precondición API: pre-autorización del carrier en ${holdMode.toUpperCase()}`, async () => {
				const current = await readHoldEnabled(page);

				if (holdMode === 'on') {
					// SÓLO se asevera: encenderlo también sería una escritura sobre el carrier
					// compartido, y "reparar" en silencio una precondición rota esconde justamente lo
					// que hay que ver — que alguien dejó el toggle en OFF (típicamente una corrida Hold
					// OFF cuyo restore no llegó a completarse).
					expect(current, 'El carrier debe tener la pre-autorización ACTIVA para este caso (Hold ON). Está en OFF: habilitarla en Configuración Parámetros → "Aplicar Pre-Autorización", o revisar si una corrida Hold OFF previa no restauró el toggle.').toBe(true);

					return;
				}

				// Hold OFF: sólo se registra el valor a restaurar si de verdad hay cambio.
				if (current) {
					holdToRestore = current;
				}
				await setHoldViaApi(page, false);
				// Debería quedar apagado: sin verificarlo, un POST que el backend ignore haría correr
				// el caso con el hold ACTIVO y acreditaría un TC "Hold OFF" ejecutando Hold ON — el
				// mismo falso positivo que este eje viene a cerrar.
				expect(await readHoldEnabled(page), 'La pre-autorización no quedó apagada tras el POST de parámetros — el caso correría con hold ACTIVO.').toBe(false);
				debugLog('gateway-pg:stepwise', `[hold] apagado (valor previo: ${current ? 'ON' : 'OFF'}; ${holdToRestore === null ? 'sin restore pendiente' : 'se restaura en el finally'})`);
			});
		}

		if (cardFlow === 'new') {
			await step(`Precondición API: limpiar del wallet la tarjeta •••• ${card.last4}`, async () => {
				// WORKAROUND (2026-07-28) — borrar la tarjeta desde la UI del alta y volver a adicionarla
				// hace que el backend responda HTTP 500 en `POST /passengers/{id}/cards`: reproducido en
				// TC1011 (pax 8669) y TC1061 (pax 4951), mientras TC1051 pasó porque su pasajero no tenía
				// tarjeta previa. El borrado por API usa otro recurso (`DELETE /users/{id}/cards/{cardId}`)
				// y deja el perfil consistente, así que se limpia ACÁ —antes de abrir el form— y el
				// borrado por UI del paso 8 queda sólo como respaldo.
				// El 500 es un hallazgo de producto pendiente de reportar; esto lo esquiva, no lo arregla.
				const deleted = await cleanupCardsByLast4(page, defaults.paxSearchQueries, card.last4);
				debugLog('gateway-pg:stepwise', `[precond API] tarjetas borradas con last4=${card.last4}: ${deleted}`);
			});
		}

		await step('Abrir el formulario de Alta de Viaje (New trip)', async () => {
			await travel.goto();
			// Debería renderizar el formulario de alta con sus campos disponibles.
			await travel.ensureLoaded();
		});

		await step(`Seleccionar el cliente "${client}" → Tipo de Servicio auto = "Regular"`, async () => {
			await travel.selectClient(client);
			// Debería quedar el cliente seleccionado en el form.
			await travel.assertClientSelected(client);
			// Debería auto-seleccionar el Tipo de Servicio en "Regular" — default que aplica la
			// pantalla sola al elegir el cliente; el test no lo setea.
			await travel.assertDefaultServiceTypeRegular();
		});

		await step(autoAssignsPassenger ? `Pasajero auto-asignado por el cliente "${passenger}" (no se toca el campo)` : `Seleccionar el pasajero "${passenger}"`, async () => {
			if (!autoAssignsPassenger) {
				await travel.selectPassenger(passenger);
			}
			// Debería quedar el pasajero asignado — elegido, o auto-asignado por el cliente cuando
			// éste es el propio pasajero (empresa individuo / app pax). Sin esta verificación, una
			// auto-asignación que no ocurre deja el alta sin pasajero y el fallo emerge 45s después
			// en el paso de vehículo, sin señalar la causa.
			await travel.assertPassengerSelected(passenger);
		});

		await step(`Fijar origen "${origin}"`, async () => {
			await travel.setOrigin(origin);
			// Debería quedar el origen commiteado. `setOrigin` tiene un camino de éxito SILENCIOSO
			// (si el autocomplete no devuelve opciones presiona Escape y retorna sin error): en la
			// corrida TC1061 del 2026-07-27 el paso pasó en verde con el origen precargado del
			// cliente ("3500 Paradise Road, Las Vegas") en vez del del caso.
			await travel.assertOriginSet(origin);
		});

		await step(`Fijar destino "${destination}"`, async () => {
			await travel.setDestination(destination);
			// Debería quedar el destino commiteado (mismo riesgo de éxito silencioso que el origen).
			await travel.assertDestinationSet(destination);
		});

		if (cardFlow === 'existing') {
			await step(`Seleccionar la tarjeta pre-autorizada YA VINCULADA (•••• ${card.last4})`, async () => {
				// La precondición se verifica en la UI —no por API— a propósito: `paxSearchQueries` es
				// una lista de fragmentos compartida por los tres actores ('smith'/'fast'/'Emanuel'), así
				// que puede resolver un pasajero DISTINTO al del caso y acreditar la tarjeta de otro.
				// El desplegable de Forma de Pago de ESTE formulario, con ESTE cliente y ESTE pasajero
				// ya elegidos, es el oráculo exacto de lo que el caso necesita.
				const hasSavedCard = await travel.hasSavedCardWithLast4(card.last4);

				// SKIP, no fallo: la tarjeta la vincula otro TC de la matriz (el caso "seed" —
				// TS-AUTHORIZE-TC1051 / TS-EBIZ-TC1058). Vincularla acá convertiría este caso en el de
				// tarjeta NUEVA, que es precisamente lo que debe distinguir; y fallar culparía a este
				// caso de una precondición que no le toca crear.
				// El diagnóstico se lee DENTRO del `if`: en el template del `test.skip` se evaluaría
				// siempre, agregando una lectura de UI (y su posible fallo) al camino que sí encontró
				// la tarjeta.
				if (!hasSavedCard) {
					const paymentMethod = await travel.getPaymentMethodText().catch(() => '(ilegible)');

					test.skip(true, `[cardFlow=existing] Precondición no satisfecha: el pasajero "${passenger}" debe tener la tarjeta •••• ${card.last4} YA vinculada. Forma de Pago muestra: "${paymentMethod}". Correr antes el caso seed de tarjeta nueva (colaboradorHappyNewHoldOn / empresaHappyNewHoldOn) o vincularla a mano.`);
				}

				await travel.selectSavedPreauthorizedCard(card.last4);
				debugLog('gateway-pg:stepwise', `[paso ${stepIndex}] tarjeta existente •••• ${card.last4} seleccionada sin re-vincular`);
			});

			// Los pasos de fill + "Validar" NO se emiten: con la tarjeta ya vinculada no hay hold de
			// vinculación (la primera de las DOS transacciones de la regla de negocio). El caso
			// ejercita únicamente el hold DEL VIAJE, que es exactamente lo que la matriz distingue
			// entre "tarjeta nueva" y "tarjeta vinculada existente".
			await runPostCardSteps();

			return;
		}

		await step(`Método de pago pre-autorizado, listo para tarjeta nueva (•••• ${card.last4})`, async () => {
			// UNA sola llamada que modela las DOS ramas de las grabaciones validadas (ver el JSDoc de
			// `selectPreauthorizedCardMethod`): con tarjeta previa hay que seleccionar la guardada,
			// borrarla, REABRIR el desplegable y reseleccionar; sin tarjeta previa alcanza con elegir
			// la opción por texto. El helper antes usaba sólo la rama simple y por eso TC1051 pasaba
			// (pax sin tarjeta) mientras TC1011/TC1061 morían más adelante (pax con tarjeta).
			const hadSavedCard = await travel.selectPreauthorizedCardMethod(card.last4);
			debugLog('gateway-pg:stepwise', `[paso ${stepIndex}] tarjeta previa •••• ${card.last4}: ${hadSavedCard ? 'existía y se eliminó' : 'no había'}`);
			// Debería quedar el wallet sin la tarjeta de prueba: si sobrevive, el form de tarjeta nueva
			// no se renderiza y el test moriría en el paso siguiente culpando al fill.
			expect(await travel.hasSavedCardWithLast4(card.last4), `La tarjeta •••• ${card.last4} sigue vinculada — el form de tarjeta nueva no va a aparecer. Forma de Pago muestra: "${await travel.getPaymentMethodText()}"`).toBe(false);
		});

		await step(`Llenar el form nativo de tarjeta (•••• ${card.last4}) y verificar los valores`, async () => {
			expect(adapter.cardForm, `${gateway} debe usar el form nativo Angular`).toBe('native-angular');
			const form = cardFormFor(gateway);
			await form.fill(page, card);
			// Verificar el COMMIT del fill antes de validar contra la pasarela: el form reactivo
			// puede limpiar un campo ya tipeado (observado en TC1061 — el número quedó vacío). Sin
			// esto el fallo emerge en el paso 9 como un error genérico de la pasarela y manda a
			// investigar la cuenta del gateway en vez del formulario.
			await form.expectFilled?.(page, card);
			// REGLA DE NEGOCIO: con la tarjeta cargada pero SIN validar, el sistema no debe permitir
			// avanzar al armado del viaje. Se asevera acá —antes de validar— porque después del
			// paso 9 el botón ya está habilitado y la regla dejaría de ser observable.
			await travel.assertVehicleSelectionBlocked();
		});

		await step(`Validar la tarjeta contra la pasarela (esperado: ${outcome === 'card-rejected' ? 'RECHAZO' : 'aprobación'})`, async () => {
			// La UI muestra el MISMO mensaje ("Error al validar tarjeta. Por favor, revise los datos
			// ingresados.") tanto si el backend MAGIIS falló como si el gateway rechazó la tarjeta.
			// Sin discriminar, un ambiente TEST degradado se confunde con un decline real — pasó el
			// 2026-07-27 y costó una investigación entera hacia la cuenta de Authorize (BL-049).
			// Se capturan las respuestas HTTP no-2xx de la validación para separar las dos causas.
			const failedResponses: string[] = [];
			const onResponse = (response: { url(): string; status(): number; request(): { method(): string } }) => {
				const url = response.url();
				if (!/magiis|\/api\//i.test(url) || response.status() < 400) {
					return;
				}
				failedResponses.push(`${response.status()} ${response.request().method()} ${url}`);
			};

			page.on('response', onResponse);
			try {
				if (outcome === 'card-rejected') {
					// Debería mostrar el error de rechazo de la pasarela y NO confirmar la tarjeta.
					// El rechazo cae ACÁ —en la vinculación, no en el alta— porque con el hold ACTIVO
					// (default del carrier 1521) el sistema hace un hold chico para poder vincular la
					// tarjeta: si la pasarela lo declina, no queda tarjeta vinculada y el flujo no llega
					// nunca al armado del viaje. Confirmado por el líder de QA (2026-07-28) y consistente
					// con lo ya verificado en Stripe (smoke SMOKE-GW-TC14, card 0002: el botón de
					// vehículo nunca se habilita y el viaje no se crea).
					const errorText = await travel.expectNativeCardRejected(card.last4);
					debugLog('gateway-pg:stepwise', `[paso ${stepIndex}] rechazo esperado, mensaje al usuario: "${errorText}"`);
				} else {
					// Debería confirmar la tarjeta sin error. El `last4` habilita el oráculo persistente
					// (tarjeta vinculada en Forma de Pago) además del toast, que se pierde por carrera.
					await travel.validateNativeCard(card.last4);
				}
			} catch (error) {
				const diagnosis = failedResponses.length ? `AMBIENTE/BACKEND: se observaron respuestas HTTP no-2xx durante la validación →\n  ${failedResponses.join('\n  ')}` : 'GATEWAY o DATOS: no hubo respuestas HTTP no-2xx, así que el backend respondió OK y el rechazo vino de la pasarela (o el form no disparó el request).';
				throw new Error(`${(error as Error).message}\n\n[diagnóstico paso ${stepIndex}] ${diagnosis}`);
			} finally {
				page.off('response', onResponse);
			}
		});

		if (outcome === 'card-rejected') {
			await step('RECHAZO: el alta NO puede avanzar y NO se crea viaje', async () => {
				// REGLA DE NEGOCIO: una tarjeta rechazada no debe habilitar el armado del viaje.
				// Se re-asevera DESPUÉS del rechazo (el paso del fill ya lo verificó antes de validar):
				// lo que interesa acá es que el rechazo NO desbloqueó el flujo.
				await travel.assertVehicleSelectionBlocked();
				// Debería NO existir ningún POST /travels: sin tarjeta vinculada no hay alta posible.
				// Es la contracara exacta del paso de alta del camino feliz.
				expect(travelRef.travelId, `Se creó el viaje ${travelRef.travelId} con una tarjeta que la pasarela rechazó — el rechazo no cortó el alta.`).toBeNull();
			});

			// El journey termina acá: sin tarjeta vinculada no hay vehículo, ni alta, ni fila en la
			// grilla. Seguir a los pasos siguientes buscaría un viaje que por diseño no debe existir.
			return;
		}

		await runPostCardSteps();
	}

	/**
	 * Pasos posteriores a la resolución de la tarjeta — COMPARTIDOS por los dos `cardFlow`: desde
	 * acá el journey es idéntico tenga la tarjeta recién vinculada o ya vinculada de antes. Se
	 * extraen para que la rama `existing` no duplique las assertions del alta y la grilla.
	 */
	async function runPostCardSteps(): Promise<void> {
		await step(`Verificar que ${adapter.displayName} NO dispara challenge 3DS`, async () => {
			// Authorize/eBiz/MP resuelven el outcome sin modal de challenge — 3DS es exclusivo Stripe.
			expect(adapter.requires3ds, `${gateway} no debe requerir 3DS`).toBe(false);
			await expect(page.locator('iframe[name*="3ds" i], iframe[src*="3ds" i]')).toHaveCount(0);
		});

		await step('Seleccionar vehículo y enviar el servicio → capturar el travelId creado', async () => {
			// "Seleccionar Vehículo" no se habilita hasta que el alta está completa Y la tarjeta
			// validada, así que su timeout es el punto donde convergen causas muy distintas: la
			// pasarela (hold no aprobado), el backend (tarifa/ruta que no se computa aunque el
			// autocomplete haya aceptado la dirección) o el propio form. El mensaje crudo del POM
			// ("Button did not become enabled before timeout") no distingue ninguna, y el 2026-07-28
			// mandó a investigar la cuenta de Authorize cuando el ambiente TEST estaba degradado
			// resolviendo direcciones. Se agrega el estado observable para separarlas — mismo criterio
			// que el diagnóstico HTTP del paso 10.
			try {
				await travel.waitForVehicleSelectionReady();
			} catch (error) {
				const paymentMethod = await travel.getPaymentMethodText().catch(() => '(ilegible)');
				const cardLinked = paymentMethod.includes(card.last4);
				const diagnosis = cardLinked ? `La tarjeta •••• ${card.last4} SÍ quedó vinculada (Forma de Pago: "${paymentMethod}"), así que el paso de tarjeta se completó. Si el botón igual no habilita, el faltante está AGUAS ARRIBA de la pasarela: tarifa/ruta sin computar (verificar que el ambiente resuelva origen y destino), o un hold aceptado pero NO aprobado — en el dashboard del sandbox eso se ve como transacción en "Fraud Review" (Response Code 4) en vez de "Authorized".` : `La tarjeta •••• ${card.last4} NO figura vinculada (Forma de Pago: "${paymentMethod}"): el problema está en el paso de tarjeta, no en el armado del viaje.`;
				throw new Error(`${(error as Error).message}\n\n[diagnóstico paso ${stepIndex}] ${diagnosis}`);
			}
			await travel.clickSelectVehicle();
			await travel.clickSendService();
			// Debería haber un POST /travels exitoso con id: le da IDENTIDAD al viaje de ESTA corrida.
			// Sin esto el paso de la grilla buscaría una fila por (pasajero + destino), que son
			// CONSTANTES entre corridas: si el hold falla y quedó un viaje de una corrida anterior sin
			// cancelar, la assertion matchearía el residuo y reportaría PASS con el hold roto.
			await expect
				.poll(() => travelRef.travelId, {
					message: 'No se capturó ningún POST /travels con id — el alta de viaje no se completó.',
					timeout: 30_000
				})
				.not.toBeNull();
		});

		await step(`Verificar el viaje en Gestión de Viajes → columna "${outcome === 'trip-unauthorized' ? 'En conflicto' : 'Por asignar'}" (${gridName})`, async () => {
			await management.goto();

			if (outcome === 'trip-unauthorized') {
				// Debería aparecer en "En conflicto" con estado "No autorizado": la tarjeta se vinculó
				// pero el hold del VIAJE falló, así que el viaje existe y queda marcado. Es el desenlace
				// del fallo 3DS de Stripe (TS-STRIPE-TC1057) — distinto de 'card-rejected', donde el
				// rechazo ocurre antes y no hay viaje.
				await management.expectPassengerInEnConflicto(gridName, shortDestination(destination));
				return;
			}

			// Debería aparecer el viaje en "Por asignar" (hold aprobado).
			// Si cae en "En conflicto" con datos VÁLIDOS, el hold falló → escalar a dev.
			//
			// Se filtra por el destino CORTO (sólo la calle+número, igual que `shortDestination()`
			// de CarrierHoldSteps): el autocomplete y la grilla NO devuelven el mismo sufijo de
			// localidad que el string canónico. Verificado en la grabación tests/test-4.spec.ts,
			// donde el destino elegido fue "Cazadores 1987, Ciudad Autónoma…" mientras
			// JOURNEY_DEFAULTS.destination es "Cazadores 1987, Buenos Aires, Argentina" — el match
			// es token-based, así que pasar el string completo haría fallar por "buenos"/"argentina".
			//
			// Se asevera TAMBIÉN el estado de la fila: sin eso el paso pasaría con una fila que
			// existe pero está en cualquier estado, incluido "No autorizado". Se acepta el conjunto
			// de estados post-hold-aprobado (ver `HOLD_APPROVED_ROW_STATUS`) porque el driver puede
			// haber aceptado el viaje entre la creación y esta lectura.
			//
			// El diagnóstico del catch distingue dos situaciones OPUESTAS que el mensaje crudo tapa:
			// el viaje cayó en "En conflicto" (existe y el hold NO se aprobó → hallazgo de pago) o no
			// hay fila en ninguna columna (el alta no se completó → causa aguas arriba). En la corrida
			// de TC1011 del 2026-07-28 esa ambigüedad dejó sin responder justamente la pregunta del caso.
			try {
				await management.expectPassengerInPorAsignar(gridName, shortDestination(destination), HOLD_APPROVED_ROW_STATUS);
			} catch (error) {
				const column = await management.findTripColumn(gridName, shortDestination(destination)).catch(() => null);
				const diagnosis = column ? `El viaje SÍ existe pero está en la columna "${column}": se creó y el hold no quedó aprobado. Es un hallazgo de PAGO — verificar en el dashboard de la pasarela si la transacción quedó declinada o retenida para revisión (Response Code 4), y escalar a dev con esa evidencia.` : 'El viaje NO aparece en NINGUNA columna: el alta no se completó, así que la causa está aguas arriba del pago (tarifa/ruta sin computar, o el submit no llegó al backend). NO es un hallazgo de la pasarela.';
				throw new Error(`${(error as Error).message}\n\n[diagnóstico paso final] ${diagnosis}`);
			}
		});
	}
}
