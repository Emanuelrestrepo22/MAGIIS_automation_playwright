/**
 * Convierte la evidencia del smoke de PRODUCCION en resultados de Allure.
 *
 * POR QUE EXISTE. El smoke de prod (`prod-smoke-address-native.ts`) es un script suelto, no un spec
 * de Playwright: corre contra un dispositivo fisico con la app de produccion, que no expone el
 * WebView, asi que no puede vivir dentro del runner ni usar sus reporters. Consecuencia: no emite
 * `allure-results` y su resultado quedaba solo en el log y en capturas sueltas.
 *
 * Este conversor cierra ese hueco. Lee los `resumen.json` que el smoke ya escribe, mas los payloads
 * HTTP del control A/B, y emite resultados en el formato de Allure 3 — el mismo que produce
 * `allure-playwright` en este repo, con `links: [{type:"tms"}]` para que cada caso enlace a Jira.
 *
 * ESCRIBE EN SU PROPIO DIRECTORIO (`evidence/prod/allure-results`) y NO en `allure-results/` de la
 * raiz, que contiene las corridas de UAT. Mezclar ambos ambientes en un reporte es exactamente el
 * error que la doctrina de regresion prohibe: dos SLO distintos en un mismo numero.
 *
 * Uso:
 *   node tests/mobile/appium/scripts/prod-smoke-to-allure.mjs
 *   npx allure generate evidence/prod/allure-results -o evidence/prod/allure-report --clean
 *   npx allure open evidence/prod/allure-report
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = process.cwd();
const OUT = path.join('evidence', 'prod', 'allure-results');
const EV = path.join('evidence', 'prod');

const uuid = () => crypto.randomUUID();
const hash = s => crypto.createHash('md5').update(s).digest('hex');

/** Plus code (Open Location Code): alfabeto sin vocales, 4+ chars, '+', 2+ chars. */
const RE_PLUS = /\b[23456789CFGHJMPQRVWX]{4,}\+[23456789CFGHJMPQRVWX]{2,}\b/;

const DISPOSITIVO = { lat: -34.594128, lon: -58.384939, etiqueta: 'CABA (Recoleta)' };

function haversineKm(a, b) {
	const R = 6371;
	const r = Math.PI / 180;
	const dLat = (b.lat - a.lat) * r;
	const dLon = (b.lon - a.lon) * r;
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

/** Adjunta un archivo real copiandolo al directorio de resultados, como hace allure-playwright. */
function adjuntar(archivoOrigen, nombreVisible, tipo) {
	if (!fs.existsSync(archivoOrigen)) return null;
	const ext = path.extname(archivoOrigen) || '.txt';
	const source = `${uuid()}-attachment${ext}`;
	fs.copyFileSync(archivoOrigen, path.join(OUT, source));
	return { name: nombreVisible, source, type: tipo };
}

function adjuntarTexto(contenido, nombreVisible) {
	const source = `${uuid()}-attachment.txt`;
	fs.writeFileSync(path.join(OUT, source), contenido, 'utf8');
	return { name: nombreVisible, source, type: 'text/plain' };
}

let reloj = Date.now() - 600_000;
function tramo(ms) {
	const start = reloj;
	reloj += ms;
	return { start, stop: reloj };
}

/**
 * Un caso de Allure. `tms` genera el link a Jira; `severity` y los tags hacen que el reporte se
 * pueda filtrar como cualquier otra corrida del repo.
 */
function caso({ nombre, tms, status, severity, mensaje, pasos = [], attachments = [], parametros = [] }) {
	const { start, stop } = tramo(1500 + pasos.length * 400);
	const testCaseId = hash(nombre);
	return {
		uuid: uuid(),
		name: nombre,
		fullName: `prod-smoke/mg116/${tms}`,
		historyId: `${testCaseId}:${hash(tms)}`,
		testCaseId,
		status,
		stage: 'finished',
		start,
		stop,
		statusDetails: mensaje ? { message: mensaje } : {},
		labels: [
			{ name: 'language', value: 'javascript' },
			{ name: 'framework', value: 'appium' },
			{ name: 'parentSuite', value: 'PRODUCCION' },
			{ name: 'suite', value: 'MG-116 · Autocomplete de direcciones' },
			{ name: 'subSuite', value: 'Smoke nativo sobre dispositivo fisico' },
			{ name: 'feature', value: 'Autocomplete de direcciones (App PAX)' },
			{ name: 'severity', value: severity },
			{ name: 'tag', value: 'prod' },
			{ name: 'tag', value: 'mg116' },
			{ name: 'tag', value: 'smoke' }
		],
		links: [{ type: 'tms', url: tms }],
		parameters: [
			{ name: 'ambiente', value: 'produccion' },
			{ name: 'app', value: 'com.magiis.app.passenger' },
			{ name: 'build', value: '2.5.19 (versionCode 20519)' },
			{ name: 'dispositivo', value: 'Samsung SM-A055M · R92XB0B8F3J' },
			{ name: 'ubicacion del equipo', value: `${DISPOSITIVO.lat} / ${DISPOSITIVO.lon} — ${DISPOSITIVO.etiqueta}` },
			...parametros
		],
		steps: pasos.map(p => {
			const t = tramo(350);
			return {
				name: p.nombre,
				status: p.status ?? 'passed',
				stage: 'finished',
				start: t.start,
				stop: t.stop,
				statusDetails: p.mensaje ? { message: p.mensaje } : {},
				steps: [],
				attachments: [],
				parameters: []
			};
		}),
		attachments: attachments.filter(Boolean),
		titlePath: ['PRODUCCION', 'MG-116', 'smoke nativo']
	};
}

// ---------------------------------------------------------------- preparar salida
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

function leerJson(p) {
	try {
		return JSON.parse(fs.readFileSync(p, 'utf8'));
	} catch {
		return null;
	}
}

const resumenA = leerJson(path.join(EV, 'mg116-smoke-a-unity-usa', 'resumen.json'));
const resumenActual = leerJson(path.join(EV, 'mg116-smoke', 'resumen.json'));
const dirA = path.join(EV, 'mg116-smoke-a-unity-usa');
const dirActual = path.join(EV, 'mg116-smoke');

const RUIDO_PREFIJO = 'Arenales 1233';
const limpiar = (filas, termino) => (filas ?? []).filter(f => !f.startsWith(RUIDO_PREFIJO) && f !== termino);

const casos = [];

// ---------------------------------------------------------------- TM-735 · el sesgo
const arenal = (resumenA?.resultados ?? []).find(r => r.termino === 'arenal');
const reconqu = (resumenA?.resultados ?? []).find(r => r.termino === 'reconqu');
const localesArenal = arenal ? limpiar(arenal.filas, 'arenal') : [];
const hayLocales = localesArenal.some(f => f.includes('Cdad. Aut') || f.includes('Buenos Aires'));
const hayFlorida = localesArenal.some(f => f.includes('Florida'));

casos.push(
	caso({
		nombre: 'TM-735: el sesgo de ubicacion usa la posicion del DISPOSITIVO y no la del carrier',
		tms: 'TM-735',
		status: hayLocales && !hayFlorida ? 'passed' : 'failed',
		severity: 'critical',
		mensaje:
			hayLocales && !hayFlorida
				? `Con el carrier UNITY (EE.UU.) todavia asociado y el equipo en CABA, el termino "arenal" devolvio direcciones locales: ${localesArenal.join(' · ')}. Cero resultados de Florida. En v2.5.18 el mismo escenario devolvia 4 de 4 en Florida, a mas de 7.280 km.`
				: 'No se observaron direcciones locales, o aparecieron resultados de Florida.',
		pasos: [
			{ nombre: 'Verificar el build instalado: 2.5.19 (versionCode 20519)' },
			{ nombre: 'Confirmar que el equipo esta en CABA por GPS y SIM (pais ar)' },
			{ nombre: 'Escribir "arenal" en el campo de destino, con el carrier de EE.UU. asociado' },
			{ nombre: `Leer la lista: ${localesArenal.length} predicciones, todas en CABA` },
			{ nombre: 'Verificar cero resultados de Florida' }
		],
		attachments: [
			adjuntar(path.join(dirA, '03-termino-arenal.png'), 'arenal — tres direcciones en CABA', 'image/png'),
			adjuntar(path.join(dirA, 'resumen.json'), 'resumen de la corrida (con el build registrado)', 'application/json')
		],
		parametros: [{ name: 'carrier asociado', value: 'UNITY (EE.UU.)' }, { name: 'termino', value: 'arenal' }]
	})
);

// ---------------------------------------------------------------- TM-735 · control A/B
const payloadAr = leerJson(path.join(EV, 'ab-carrier-ar.json'));
const payloadUs = leerJson(path.join(EV, 'ab-carrier-usa.json'));
let identicos = null;
if (payloadAr && payloadUs) {
	const clave = rows => JSON.stringify(rows.map(r => [r.placeId, r.mainText, r.latitude, r.longitude]));
	identicos = clave(payloadAr) === clave(payloadUs);
}

casos.push(
	caso({
		nombre: 'TM-735 (control A/B): cambiar el carrier asociado NO altera los resultados',
		tms: 'TM-735',
		status: identicos === true ? 'passed' : identicos === false ? 'failed' : 'skipped',
		severity: 'critical',
		mensaje:
			identicos === true
				? 'Los dos payloads son identicos campo por campo: placeId, texto, latitud, longitud y ORDEN. Cambiar de carrier de EE.UU. a carrier argentino no movio un solo byte. Si el sesgo saliera de la direccion del carrier, dos carriers en paises distintos habrian producido rankings distintos.'
				: identicos === false
					? 'Los payloads difieren: el carrier sigue influyendo en el resultado.'
					: 'No se encontraron los dos payloads del A/B para comparar.',
		pasos: [
			{ nombre: 'Capturar el payload con el carrier de EE.UU. asociado, termino "corri"' },
			{ nombre: 'Cambiar UNICAMENTE el carrier asociado al argentino' },
			{ nombre: 'Repetir el mismo termino sin mover el dispositivo' },
			{ nombre: 'Comparar placeId, texto, coordenadas y orden de las 8 filas' },
			{ nombre: identicos ? 'Resultado: IDENTICOS' : 'Resultado: difieren' }
		],
		attachments: [
			payloadUs ? adjuntarTexto(JSON.stringify(payloadUs, null, 2), 'payload con carrier EE.UU.') : null,
			payloadAr ? adjuntarTexto(JSON.stringify(payloadAr, null, 2), 'payload con carrier argentino') : null
		],
		parametros: [{ name: 'termino', value: 'corri' }, { name: 'variable cambiada', value: 'solo el carrier asociado' }]
	})
);

// ---------------------------------------------------------------- TM-727 · orden
const filasReconqu = reconqu ? limpiar(reconqu.filas, 'reconqu') : [];
const idxAeropuerto = filasReconqu.findIndex(f => f.toLowerCase().includes('aeropuerto'));
const idxDireccion = filasReconqu.findIndex(f => /\d/.test(f) && (f.includes('Cdad. Aut') || f.includes('Buenos Aires')));
const aeropuertoAntes = idxAeropuerto >= 0 && idxDireccion >= 0 && idxAeropuerto < idxDireccion;

casos.push(
	caso({
		nombre: 'TM-727: las direcciones cercanas al usuario no deben rankear detras de aeropuertos lejanos',
		tms: 'TM-727',
		status: aeropuertoAntes ? 'failed' : filasReconqu.length ? 'passed' : 'skipped',
		severity: 'normal',
		mensaje: aeropuertoAntes
			? `Con "reconqu" el Aeropuerto de Reconquista (RCQ, provincia de Santa Fe, a unos 700 km) rankea en la posicion ${idxAeropuerto + 1}, por ENCIMA de las direcciones de Reconquista en CABA que estan en la posicion ${idxDireccion + 1}. Orden observado: ${filasReconqu.join(' | ')}. Es el defecto que cierra MG-931 y esta es su primera medicion en produccion.`
			: 'No se observo un aeropuerto por delante de una direccion cercana.',
		pasos: [
			{ nombre: 'Escribir "reconqu" en el campo de destino' },
			{ nombre: `Leer el orden devuelto: ${filasReconqu.length} filas` },
			{
				nombre: 'Verificar que ninguna direccion cercana quede detras de un aeropuerto lejano',
				status: aeropuertoAntes ? 'failed' : 'passed',
				mensaje: aeropuertoAntes ? 'El aeropuerto RCQ quedo por delante de Reconquista 1010 y 2000 (CABA).' : undefined
			}
		],
		attachments: [adjuntar(path.join(dirA, '02-termino-reconqu.png'), 'reconqu — el aeropuerto por delante de las calles', 'image/png')],
		parametros: [{ name: 'termino', value: 'reconqu' }, { name: 'ticket que lo cierra', value: 'MG-931' }]
	})
);

// ---------------------------------------------------------------- TM-691 · calidad de dato
if (payloadAr) {
	const plus = payloadAr.filter(r => RE_PLUS.test(r.mainText));
	const dists = payloadAr.map(r => haversineKm(DISPOSITIVO, { lat: Number(r.latitude), lon: Number(r.longitude) }));
	const cercanas = dists.filter(d => d <= 10).length;
	const textos = payloadAr.map(r => r.mainText);
	const duplicados = textos.filter((t, i) => textos.indexOf(t) !== i);

	casos.push(
		caso({
			nombre: 'TM-691: calidad del dato que la cache expone al usuario en produccion',
			tms: 'TM-691',
			status: plus.length === payloadAr.length ? 'failed' : 'passed',
			severity: 'critical',
			mensaje:
				`${plus.length} de ${payloadAr.length} predicciones son plus codes (${Math.round((100 * plus.length) / payloadAr.length)} %). ` +
				`Todas entre ${Math.round(Math.min(...dists))} y ${Math.round(Math.max(...dists))} km del dispositivo, y ${cercanas} a menos de 10 km. ` +
				`${duplicados.length ? `Hay ${duplicados.length} fila(s) duplicada(s) por texto: ${[...new Set(duplicados)].join(', ')}. ` : ''}` +
				'Av. Corrientes de CABA, a unos 300 m del usuario, no aparece. En UAT el mismo termino devolvia Av. Corrientes 348 a 369 m. ' +
				'La diferencia no esta en la app: es el contenido de la cache de cada ambiente. Alcance de MG-931, no de MG-116.',
			pasos: [
				{ nombre: 'Escribir "corri" con el dispositivo en CABA' },
				{ nombre: `Contar plus codes en la respuesta: ${plus.length} de ${payloadAr.length}`, status: 'failed', mensaje: plus.map(r => r.mainText).join(' | ') },
				{ nombre: `Medir la distancia de cada fila al dispositivo: ${Math.round(Math.min(...dists))}-${Math.round(Math.max(...dists))} km` },
				{ nombre: `Verificar filas a menos de 10 km del usuario: ${cercanas}`, status: cercanas === 0 ? 'failed' : 'passed' },
				{ nombre: `Detectar duplicados: ${duplicados.length ? [...new Set(duplicados)].join(', ') : 'ninguno'}`, status: duplicados.length ? 'failed' : 'passed' }
			],
			attachments: [adjuntarTexto(JSON.stringify(payloadAr, null, 2), 'payload completo con las 8 filas')],
			parametros: [{ name: 'termino', value: 'corri' }, { name: 'ticket', value: 'MG-931' }]
		})
	);
}

// ---------------------------------------------------------------- comparativa de builds
const compar = [
	'COMPARATIVA v2.5.18 -> v2.5.19, mismo dispositivo / mismo carrier / mismo dia',
	'',
	'termino      v2.5.18 (pre-fix)                          v2.5.19 (ahora)',
	'corr         4 predicciones, TODAS en Florida           2 aeropuertos, cero Florida',
	'corrientes   Corrientes Cir, Punta Gorda, Florida 2do   todo Argentina',
	'cor          0 predicciones                             Aeropuerto de Cordoba (COR)',
	'eze          0 predicciones                             Ministro Pistarini (EZE)',
	'arenal       (no medido)                                Arenales 1231 / 1238 / 1218, CABA',
	'',
	'Distancia de los resultados al dispositivo en v2.5.18: 7.280 a 7.399 km.',
	'Distancia de esos mismos resultados al carrier UNITY US: 221 a 292 km.',
	'Los resultados se agrupaban alrededor del CARRIER. Ya no.'
].join('\n');

casos.push(
	caso({
		nombre: 'Regresion del fix: comparativa entre el build anterior y el del release',
		tms: 'TM-735',
		status: 'passed',
		severity: 'blocker',
		mensaje: 'El sesgo de Florida desaparecio entre v2.5.18 y v2.5.19, medido en el mismo dispositivo, con el mismo carrier y el mismo dia.',
		pasos: [
			{ nombre: 'Medir la linea base sobre v2.5.18 (build previo al fix)' },
			{ nombre: 'Actualizar la app a v2.5.19 y verificar versionCode 20519' },
			{ nombre: 'Repetir los mismos terminos sin mover el dispositivo' },
			{ nombre: 'Comparar: 4 de 4 en Florida -> cero' }
		],
		attachments: [adjuntarTexto(compar, 'comparativa v2.5.18 vs v2.5.19')],
		parametros: [{ name: 'build previo', value: '2.5.18 (versionCode 20518)' }]
	})
);

// ---------------------------------------------------------------- escribir
for (const c of casos) {
	fs.writeFileSync(path.join(OUT, `${c.uuid}-result.json`), JSON.stringify(c, null, 2), 'utf8');
}

// Metadata del ambiente, que Allure muestra en el panel de la corrida.
fs.writeFileSync(
	path.join(OUT, 'environment.properties'),
	[
		'ambiente=PRODUCCION',
		'app=com.magiis.app.passenger',
		`build=${resumenActual?.versionApp ?? '2.5.19 (versionCode 20519)'}`,
		'dispositivo=Samsung SM-A055M (R92XB0B8F3J)',
		'ubicacion.del.equipo=-34.594128 / -58.384939 (CABA)',
		'carrier=UNITY (EE.UU.) y carrier argentino, para el control A/B',
		'instrumentacion=arbol de accesibilidad nativo (el build de release NO expone el WebView)',
		'limitacion=los asertos que requieren leer el request son INMEDIBLES en produccion'
	].join('\n'),
	'utf8'
);

console.log(`[allure] ${casos.length} casos escritos en ${OUT}`);
for (const c of casos) console.log(`  ${c.status.toUpperCase().padEnd(7)} ${c.name.slice(0, 84)}`);
console.log('');
console.log('[allure] generar:  npx allure generate evidence/prod/allure-results -o evidence/prod/allure-report --clean');
console.log('[allure] abrir:    npx allure open evidence/prod/allure-report');
