/**
 * [TM-1099] TC118 — Validar la carga de un concepto tipo Fijo por el chofer sobre el viaje en curso.
 * Smoke de Universal F1 · Otros Costos (MG-995 / MG-996, anticipa F7 / MG-1034). Test Set TM-1119.
 *
 * ORIGEN. ROI del plan TM-1116 (§4, spec 4 `other-costs-driver-close-smoke`): sólo el camino feliz
 * smoke — cargar un concepto Fijo al cierre. Las variantes (Cantidad / Variable / filtrado /
 * duplicados: TM-1100..1105, TM-1269) quedan manuales. La receta es la que se ejecutó a mano en
 * UAT el 29/09/2026 (UAT-TM-1099-detalle.md) con los locators relevados ese día.
 *
 * QUÉ HACE (datos reales en UAT, por eso el gate `OTHER_COSTS_CREATE_DATA=1`):
 *   1. API (sesión guardada del portal, sin login): crea el concepto «QA E2E OC DRV <run>» (Fijo,
 *      venta 10, costo 4, disponible Chofer), crea un viaje y lo asigna al chofer Senna.
 *   2. App Driver (Appium, `noReset`): disponible → Accept → Start Trip → End Trip → Resumen →
 *      Otros costos → concepto → Save → Cuenta corriente → firma → cierre.
 *   3. Oráculo: el modal prefija el importe del catálogo; el Resumen lo suma en «Otros costos»;
 *      el viaje persiste el concepto con ese importe (API del detalle del viaje que usa el portal)
 *      y, con cuenta corriente, el total es aditivo (amount = tarifa + otros costos).
 *   4. Limpieza en `finally`: cancela el viaje si quedó incompleto, borra el concepto (el viaje lo
 *      conserva), deja al chofer «No disponible» y devuelve el GPS. Todo verificado por API.
 *
 * POR QUÉ CUENTA CORRIENTE. H-UAT-01 (hallazgo abierto, 29/09): en efectivo la app aplica el 50 %
 * de descuento del carrier también a los otros costos (total 5.34 en vez de 10.34). Ese número NO es
 * el esperado del caso y no se afirma: el Resumen en efectivo se registra como observación. Con
 * tarjeta la app pide una tarjeta real, así que el cierre va por cuenta corriente, que en UAT
 * mantiene la suma aditiva. Con cuenta corriente la app muestra tarifa y total como «AGREED».
 *
 * BASE DE DATOS. El Test pide verificar TRAVEL_OTHERCOST; la base UAT no es alcanzable desde esta red
 * (regla /32, BL-046). El oráculo de persistencia es `GET carriers/{id}/travels/{travelId}`, el
 * mismo dato que alimenta el detalle del portal (`otherCostList`).
 *
 * EJECUCIÓN (ver package.json): `pnpm test:uat:othercosts:driver`
 *   Requiere: Appium arriba, emulador con la App Driver UAT logueada (chofer Senna), la sesión del
 *   portal en OTHER_COSTS_CARRIER_STORAGE_STATE y, en emulador, MOBILE_ENV_OVERLAY=.env.emulator-uat.
 */

import { test, expect, request, type APIRequestContext } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CarrierOtherCostsApi, OTHER_COSTS_E2E_PREFIX, type OtherCostItem } from '@api/CarrierOtherCostsApi';
import {
	CarrierTravelsApi,
	TERMINAL_TRAVEL_STATES,
	pickTravelMeasurement,
	type TravelDetail
} from '@api/CarrierTravelsApi';
import {
	assertDriverAppConceptName,
	buildTripCreateBody,
	getDriverCloseTripData,
	newRunId
} from '@features/other-costs/data/driver-close-trip.data';
import { loadCarrierStorageSession, redactSecrets } from '@features/other-costs/helpers/carrierStorageSession';
import { getDriverAppConfig } from '../../config/appiumRuntime';
import { setEmulatorGeo } from '../../helpers/emulatorGeo';
import { DriverOtherCostsCloseScreen, type TripSummaryValues } from '../DriverOtherCostsCloseScreen';

const TEST_KEY = 'TM-1099';
const ENV = process.env.ENV ?? 'test';

/** '$ 10.00' / '$10.69' → número; 'AGREED' u otro texto → null. */
function parseMoney(text: string | null | undefined): number | null {
	// Con símbolo manda el importe que sigue al `$` (un ítem trae el nombre del concepto delante,
	// y «E2E» tiene un dígito); sin símbolo (el input del modal) vale el texto completo.
	const compact = (text ?? '').replace(/\s/g, '');
	const match = compact.includes('$') ? /\$(-?\d+(?:[.,]\d+)?)/.exec(compact) : /^(-?\d+(?:[.,]\d+)?)$/.exec(compact);
	return match ? Number(match[1].replace(',', '.')) : null;
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

/** Estado del chofer por API, con reintento hasta el estado buscado. */
async function waitForDriverState(api: CarrierTravelsApi, driverUserId: number, state: string, timeoutMs = 15_000) {
	const deadline = Date.now() + timeoutMs;
	let last = await api.getDriverStatus(driverUserId);
	while (last.state !== state && Date.now() < deadline) {
		await new Promise(resolve => setTimeout(resolve, 1_000));
		last = await api.getDriverStatus(driverUserId);
	}
	return last;
}

/**
 * Lleva al chofer a ONLINE/OFFLINE con el toggle de la app y lo confirma por API. Recién abierta
 * la sesión, el home puede ignorar el primer toque mientras termina de cargar: hasta 3 intentos.
 */
async function setDriverAvailability(
	app: DriverOtherCostsCloseScreen,
	api: CarrierTravelsApi,
	driverUserId: number,
	state: 'ONLINE' | 'OFFLINE'
) {
	let last = await api.getDriverStatus(driverUserId);
	for (let attempt = 0; attempt < 3 && last.state !== state; attempt++) {
		await app.toggleAvailability();
		last = await waitForDriverState(api, driverUserId, state);
	}
	return last;
}

test.describe('Otros Costos · App Driver — smoke Universal F1', () => {
	test.describe.configure({ mode: 'serial', timeout: 420_000 });

	test(
		`[${TEST_KEY}] TC118 · Validar la carga de un concepto tipo Fijo por el chofer sobre el viaje en curso`,
		{ annotation: [{ type: 'tms', description: TEST_KEY }], tag: ['@smoke', '@e2e-hybrid', '@other-costs'] },
		async ({}, testInfo) => {
			test.skip(
				process.env.OTHER_COSTS_CREATE_DATA !== '1',
				'Crea datos reales (concepto + viaje) en el ambiente: requiere OTHER_COSTS_CREATE_DATA=1.'
			);
			test.skip(!process.env.APPIUM_SERVER_URL, 'Requiere APPIUM_SERVER_URL y el dispositivo conectado.');

			const data = getDriverCloseTripData(ENV);
			const runId = newRunId();
			const conceptName = `${OTHER_COSTS_E2E_PREFIX}DRV ${runId}`;
			assertDriverAppConceptName(conceptName);
			const evidenceDir = path.resolve('evidence', ENV, 'other-costs-driver', runId);
			await mkdir(evidenceDir, { recursive: true });

			const session = loadCarrierStorageSession({
				storageStatePath: process.env.OTHER_COSTS_CARRIER_STORAGE_STATE ?? '',
				origin: process.env.BASE_URL ?? '',
				expectedCarrierId: data.carrierId,
				minValidityMs: 30 * 60_000
			});
			const apiContext: APIRequestContext = await request.newContext();
			const otherCostsApi = new CarrierOtherCostsApi({ request: apiContext }, session);
			const travelsApi = new CarrierTravelsApi({ request: apiContext }, session);
			const config = getDriverAppConfig();
			const app = new DriverOtherCostsCloseScreen(config);

			// Estado compartido con la limpieza y con la medición.
			let concept: OtherCostItem | null = null;
			let travelId: number | null = null;
			let travelCode: number | null = null;
			let appStarted = false;
			const measurement: Record<string, unknown> = {
				testKey: TEST_KEY,
				runId,
				env: ENV,
				appPackage: config.appPackage,
				udid: config.udid,
				carrierId: data.carrierId,
				driverUserId: data.driverUserId
			};
			const screenshots: string[] = [];
			const snap = async (label: string) => {
				const file = await app.screenshot(path.join(evidenceDir, `${TEST_KEY}-${label}.png`));
				screenshots.push(path.relative(process.cwd(), file));
				return file;
			};

			try {
				await test.step('Precondiciones: sesión del portal, chofer libre y App Driver logueada', async () => {
					const status = await travelsApi.getDriverStatus(data.driverUserId);
					expect(
						status.currentTrip ?? null,
						'el chofer no debe tener un viaje en curso antes de empezar'
					).toBeNull();
					await app.startSession();
					appStarted = true;
					if (await app.isLoggedOut()) {
						throw new Error(
							'STOP: la App Driver no tiene sesión iniciada; un humano debe loguear al chofer (noReset).'
						);
					}
				});

				await test.step('Dado un concepto Fijo con costo, disponible para el Chofer, en el catálogo', async () => {
					concept = await otherCostsApi.createFixed({
						name: conceptName,
						conceptValue: data.concept.saleValue,
						apply: ['DRIVER'],
						isCommisionable: true,
						isByCost: true,
						conceptValueCost: data.concept.costValue,
						currencyId: data.currencyId
					});
					const catalogRow = (await otherCostsApi.search()).find(item => item.id === concept!.id);
					expect(catalogRow, 'el concepto creado debe figurar en el catálogo').toBeDefined();
					expect(catalogRow!.conceptType).toBe('FIX');
					expect(catalogRow!.apply).toContain('DRIVER');
					measurement.concept = {
						id: catalogRow!.id,
						name: catalogRow!.concept,
						type: catalogRow!.conceptType,
						saleValue: catalogRow!.conceptValue,
						costValue: catalogRow!.conceptValueCost,
						isCommisionable: catalogRow!.isCommisionable,
						apply: catalogRow!.apply
					};
				});

				await test.step('Y un viaje del portal asignado al chofer, que lo acepta e inicia desde la app', async () => {
					await setEmulatorGeo(config.udid, data.origin);
					const online = await setDriverAvailability(app, travelsApi, data.driverUserId, 'ONLINE');
					expect(online.state, 'el chofer debe quedar disponible (ONLINE) para recibir el viaje').toBe(
						'ONLINE'
					);

					const created = await travelsApi.create(
						buildTripCreateBody(data, {
							operatorUserId: session.subUserId,
							note: `${conceptName} ${TEST_KEY}`
						})
					);
					travelId = created.travelId;
					travelCode = created.travelIdForCarrier;
					measurement.trip = { travelId, travelIdForCarrier: travelCode };
					await travelsApi.assign(travelId, data.driverUserId);

					await app.waitForAssignedTrip(travelId);
					await app.acceptTrip();
					await app.startTrip();
				});

				let summaryBefore: TripSummaryValues | null = null;
				await test.step('Cuando el chofer finaliza el recorrido y llega al Resumen del viaje', async () => {
					await setEmulatorGeo(config.udid, data.destination);
					// El GPS del emulador no deja estado observable en el DOM: margen para que el plugin
					// de geolocalización de la app tome la posición de destino antes de finalizar.
					await app.getDriver().pause(4_000);
					await app.endTrip();
					summaryBefore = await app.readSummary();
					expect(summaryBefore.otherCostsButtonDisabled, 'Otros costos debe estar habilitado').toBe(false);
					await snap('1-resumen-sin-concepto');
				});

				await test.step('Y agrega el concepto Fijo desde «Otros costos» y confirma', async () => {
					await app.openOtherCosts();
					const offered = await app.listOfferedConcepts();
					expect(offered, 'el concepto con disponibilidad Chofer debe ofrecerse en la app').toContain(
						conceptName
					);
					await app.selectConcept(conceptName);
					const form = await app.readOtherCostForm();
					measurement.appOtherCostForm = form;
					expect(form.selectedConcept).toBe(conceptName);
					expect(parseMoney(form.amount), 'importe prefijado = venta del catálogo').toBe(
						data.concept.saleValue
					);
					expect(form.amountEditable, 'un concepto Fijo no admite editar el importe').toBe(false);
					expect(form.saveEnabled).toBe(true);
					await snap('2-modal-concepto-fijo-seleccionado');
					await app.saveOtherCost();
				});

				await test.step('Entonces el Resumen suma el concepto con el importe del catálogo, sin error', async () => {
					const cashView = await app.readSummary();
					expect(parseMoney(cashView.otherFees)).toBe(data.concept.saleValue);
					expect(cashView.otherFeeItems.join(' | ')).toContain(conceptName);

					await app.selectPaymentMethod('CHECKING_ACCOUNT');
					const checkingView = await app.readSummary();
					expect(parseMoney(checkingView.otherFees), 'Otros costos con cuenta corriente').toBe(
						data.concept.saleValue
					);
					expect(checkingView.otherFeeItems).toContainEqual(expect.stringContaining(conceptName));
					expect(
						parseMoney(checkingView.otherFeeItems.find(item => item.includes(conceptName))),
						'importe del ítem en el detalle de Otros costos'
					).toBe(data.concept.saleValue);
					await snap('3-resumen-con-concepto-cuenta-corriente');

					measurement.appSummary = {
						antesDelConcepto: {
							fare: summaryBefore?.fare,
							otherFees: summaryBefore?.otherFees,
							total: summaryBefore?.total
						},
						observadoEfectivoPorDefecto: {
							nota: 'H-UAT-01 conocido (descuento de efectivo aplicado a otros costos); no es el esperado del caso',
							fare: cashView.fare,
							otherFees: cashView.otherFees,
							total: cashView.total,
							commission: cashView.commission
						},
						cuentaCorriente: {
							fare: checkingView.fare,
							otherFees: checkingView.otherFees,
							otherFeeItems: checkingView.otherFeeItems,
							total: checkingView.total,
							commission: checkingView.commission,
							closeButton: checkingView.closeButtonText
						}
					};
				});

				await test.step('Y el viaje se cierra sin error (firma del pasajero, cuenta corriente)', async () => {
					const { signatureDrawn } = await app.signAndCloseTrip();
					measurement.close = {
						paymentMethod: 'CHECKING_ACCOUNT',
						signatureDrawn,
						appUrlAfter: (await app.currentUrl()).replace(/;.*/, '')
					};
					await snap('4-home-tras-cierre');
				});

				await test.step('Y el viaje persiste el concepto con la venta del catálogo y el total es aditivo', async () => {
					let detail: TravelDetail = await travelsApi.getDetail(travelId!);
					const deadline = Date.now() + 20_000;
					while (detail.state !== 'DONE' && Date.now() < deadline) {
						await new Promise(resolve => setTimeout(resolve, 1_500));
						detail = await travelsApi.getDetail(travelId!);
					}
					measurement.portalApiDetail = pickTravelMeasurement(detail);

					expect(detail.state).toBe('DONE');
					expect(detail.paymentMethod).toBe('CHECKING_ACCOUNT');
					const rows = (detail.otherCostList ?? []).filter(row => row.name === conceptName);
					expect(rows, 'una fila del concepto en otherCostList').toHaveLength(1);
					expect(rows[0].price, 'precio del concepto en el viaje = venta del catálogo').toBe(
						data.concept.saleValue
					);
					expect(detail.otherCost).toBe(data.concept.saleValue);
					expect(typeof detail.tourPrice).toBe('number');
					expect(round2(detail.amount ?? NaN), 'amount = tarifa + otros costos (cuenta corriente)').toBe(
						round2((detail.tourPrice ?? NaN) + (detail.otherCost ?? NaN))
					);
				});
			} finally {
				measurement.cleanup = await test.step('Limpieza verificada por API', async () => {
					const cleanup: Record<string, unknown> = {};
					const attempt = async (label: string, fn: () => Promise<unknown>) => {
						try {
							cleanup[label] = await fn();
						} catch (error) {
							cleanup[label] =
								`ERROR: ${redactSecrets(error instanceof Error ? error.message : String(error))}`;
						}
					};
					if (travelId !== null) {
						await attempt('viaje', async () => {
							const state = (await travelsApi.getDetail(travelId!)).state ?? '';
							if (TERMINAL_TRAVEL_STATES.includes(state)) return `sin acción (${state})`;
							// En el Resumen (CLOSING_TRAVEL) la API ya no permite cancelar (400
							// ACTION_NOT_ALLOWED): se cierra desde la app, con cuenta corriente.
							if (appStarted && (await app.isOnSummary())) {
								await app.cancelOtherCostModalIfOpen();
								await app.selectPaymentMethod('CHECKING_ACCOUNT');
								await app.signAndCloseTrip();
								return `cerrado desde la app (estaba ${state}) → ${(await travelsApi.getDetail(travelId!)).state}`;
							}
							await travelsApi.cancel(travelId!);
							return `cancelado (estaba ${state}) → ${(await travelsApi.getDetail(travelId!)).state}`;
						});
					}
					if (concept !== null) {
						const conceptId = (concept as OtherCostItem).id;
						await attempt('concepto', async () => {
							await otherCostsApi.remove(conceptId);
							const stillThere = (await otherCostsApi.search()).some(item => item.id === conceptId);
							if (stillThere) throw new Error(`el concepto ${conceptId} sigue en el catálogo`);
							return `borrado (${conceptId})`;
						});
						if (travelId !== null) {
							await attempt('historialDelViaje', async () => {
								const rows = (await travelsApi.getDetail(travelId!)).otherCostList ?? [];
								return rows.some(row => row.name === conceptName)
									? 'el viaje conserva el concepto'
									: 'el viaje NO lista el concepto';
							});
						}
					}
					await attempt('chofer', async () => {
						const status = appStarted
							? await setDriverAvailability(app, travelsApi, data.driverUserId, 'OFFLINE')
							: await travelsApi.getDriverStatus(data.driverUserId);
						if (status.state !== 'OFFLINE') throw new Error(`el chofer quedó ${status.state}`);
						return `OFFLINE${status.currentTrip ? ' con viaje en curso' : ''}`;
					});
					await attempt('gps', async () =>
						(await setEmulatorGeo(config.udid, data.restGps)) ? 'restaurado' : 'no aplica'
					);
					if (appStarted) await app.endSession();
					await apiContext.dispose();
					return cleanup;
				});

				measurement.screenshots = screenshots;
				const measurementPath = path.join(evidenceDir, `xray-medicion-${TEST_KEY}.json`);
				await writeFile(measurementPath, JSON.stringify(measurement, null, 2), 'utf-8');

				// Orden = prioridad para el tope de 3 adjuntos del reporter de Xray.
				const attachPng = async (file: string | undefined) => {
					if (file)
						await testInfo.attach(path.basename(file, '.png'), {
							path: path.resolve(file),
							contentType: 'image/png'
						});
				};
				const summaryShot = screenshots.find(s => s.includes('3-resumen'));
				const modalShot = screenshots.find(s => s.includes('2-modal'));
				await attachPng(summaryShot);
				await testInfo.attach(`xray-medicion-${TEST_KEY}`, {
					path: measurementPath,
					contentType: 'application/json'
				});
				await attachPng(modalShot);
				for (const file of screenshots.filter(s => s !== summaryShot && s !== modalShot)) await attachPng(file);

				testInfo.annotations.push({ type: 'xray_comment', description: buildComment(measurement) });
				console.log(`\n[${TEST_KEY}] medición: ${path.relative(process.cwd(), measurementPath)}`);
			}
		}
	);
});

/** Comentario del run (≤ 1500 caracteres): qué se ejecutó y qué devolvió. Sin PII ni tokens. */
function buildComment(m: Record<string, unknown>): string {
	const c = (m.concept ?? {}) as Record<string, unknown>;
	const t = (m.trip ?? {}) as Record<string, unknown>;
	const form = (m.appOtherCostForm ?? {}) as Record<string, unknown>;
	const summary = (m.appSummary ?? {}) as Record<string, Record<string, unknown>>;
	const cc = summary.cuentaCorriente ?? {};
	const cash = summary.observadoEfectivoPorDefecto ?? {};
	const api = (m.portalApiDetail ?? {}) as Record<string, unknown>;
	const rows = ((api.otherCostList as Array<Record<string, unknown>>) ?? []).map(
		r => `{id ${r.id}, «${r.name}», price ${r.price}}`
	);
	const cleanup = Object.entries((m.cleanup ?? {}) as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`);
	// Sólo se escribe lo que efectivamente se midió: si la corrida cortó antes, la línea no aparece.
	const lines = [
		`Ejecución automatizada (Appium + API) · ${String(m.env).toUpperCase()} · carrier ${m.carrierId} · chofer ${m.driverUserId} · ${m.appPackage} en ${m.udid} · run ${m.runId}`,
		m.concept &&
			`Concepto «${c.name}» (id ${c.id}): ${c.type}, venta ${c.saleValue}, costo ${c.costValue}, disponible ${(c.apply as string[] | undefined)?.join('/')}.`,
		m.trip &&
			`Viaje ${t.travelId}${t.travelIdForCarrier ? ` / ${t.travelIdForCarrier}-W` : ''}: alta y asignación por API; app: Accept → Start Trip → End Trip → Otros costos → concepto → Save → Cuenta corriente → firma → cierre.`,
		m.appOtherCostForm && `App: modal con importe ${form.amount} (editable: ${form.amountEditable}).`,
		m.appSummary &&
			`App Resumen (cuenta corriente): «Otros costos» ${cc.otherFees} (${(cc.otherFeeItems as string[] | undefined)?.join('; ')}); comisión ${cc.commission}; tarifa/total: ${cc.fare}/${cc.total}.`,
		m.portalApiDetail &&
			`API GET travels/${t.travelId}: state ${api.state} · ${api.paymentMethod} · otherCostList [${rows.join(', ')}] · otherCost ${api.otherCost} · tourPrice ${api.tourPrice} · amount ${api.amount}.`,
		m.appSummary &&
			`Observado en efectivo (medio por defecto): tarifa ${cash.fare} · total ${cash.total} — H-UAT-01 conocido, no se afirma.`,
		cleanup.length > 0 && `Limpieza: ${cleanup.join(' · ')}.`
	].filter((line): line is string => typeof line === 'string');
	return redactSecrets(lines.join('\n')).slice(0, 1500);
}
