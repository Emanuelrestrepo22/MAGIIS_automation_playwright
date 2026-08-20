/**
 * MG-116 — analizador de payloads de autocomplete capturados A MANO (iOS).
 *
 * POR QUE EXISTE. La medicion del sesgo en Android la hace `passenger-mg116-carrier-ab.ts`
 * conduciendo Appium. En iOS no tenemos ese canal: la evidencia llega como capturas y payloads
 * pegados por el tester. Este script cierra ese hueco — toma el payload tal como viene y emite el
 * MISMO veredicto que la version automatizada, para que las dos plataformas se comparen contra el
 * mismo criterio y no contra la impresion de quien mira la pantalla.
 *
 * NO invoca Appium ni la red. Entra JSON, sale veredicto. Sin dependencias: node puro.
 *
 * USO
 *   node tests/mobile/appium/scripts/mg116-analizar-payload-ios.mjs <archivo.json> [--superficie "Mis Direcciones"] [--termino corri]
 *   cat payload.json | node tests/mobile/appium/scripts/mg116-analizar-payload-ios.mjs - --superficie "Alta de viaje"
 *
 * ENTRADA ACEPTADA. Cualquiera de estas formas, porque el payload cambia segun de donde se copie:
 *   - { predictions: [...] }  |  { data: [...] }  |  { results: [...] }  |  un array pelado
 *   - coordenadas por prediccion en latitude/longitude, lat/lon, lat/lng o geometry.location.lat/lng
 *   - opcional: `requestUrl` o `url` con los query params latitude/longitude -> ES EL DATO DECISIVO,
 *     porque es el sesgo que la app ENVIO, no el que se infiere de los resultados.
 *
 * REFERENCIAS FIJAS (medidas y confirmadas por DB en la campaña, no estimadas)
 *   - Usuario del simulacro: Reconquista 661, CABA.
 *   - Carrier 1481 UNITY US -> CARRIERPLACE 1611 = 25.9300485 / -80.1262026 (Sunny Isles Beach, FL).
 *     Si el sesgo cae ahi, el fix NO entro en esta plataforma.
 */

const USUARIO = { lat: -34.6009, lon: -58.3731, etiqueta: 'Reconquista 661, CABA' };
const CARRIER_US = { lat: 25.9300485, lon: -80.1262026, etiqueta: 'CARRIERPLACE 1611 — Sunny Isles Beach, FL' };
const CARRIER_AR = { lat: -34.6037, lon: -58.3816, etiqueta: 'carrier argentino (referencia aproximada)' };
/** Tolerancia del sesgo respecto del usuario. Android medido con el fix: 119 m. */
const TOLERANCIA_KM = 3;

function haversineKm(a, b) {
	const R = 6371;
	const rad = d => (d * Math.PI) / 180;
	const dLat = rad(b.lat - a.lat);
	const dLon = rad(b.lon - a.lon);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

function fmtDist(km) {
	return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 2 : 0)} km`;
}

/** Saca lat/lon de una prediccion sin asumir una sola forma de payload. */
function coordsDe(p) {
	const cand = [
		[p.latitude, p.longitude],
		[p.lat, p.lon],
		[p.lat, p.lng],
		[p?.geometry?.location?.lat, p?.geometry?.location?.lng],
		[p?.location?.latitude, p?.location?.longitude],
		[p?.coordinates?.latitude, p?.coordinates?.longitude]
	];
	for (const [la, lo] of cand) {
		const nla = Number(la);
		const nlo = Number(lo);
		if (Number.isFinite(nla) && Number.isFinite(nlo) && (nla !== 0 || nlo !== 0)) return { lat: nla, lon: nlo };
	}
	return null;
}

function etiquetaDe(p) {
	// `mainText` va PRIMERO porque es lo que trae el payload de MAGIIS y es lo que el usuario ve en la
	// lista. Se omitio en la primera version y el analizador cayo al JSON.stringify: en la pantalla del
	// home no se noto porque ese payload trae ademas `shortName`, pero el de viaje programado no.
	return (
		p.mainText ??
		p.main_text ??
		p.shortName ??
		p.short_name ??
		p.name ??
		p.description ??
		p.formattedAddress ??
		p.formatted_address ??
		p.address ??
		JSON.stringify(p).slice(0, 60)
	);
}

/** El sesgo que la app ENVIO, si el payload trae la URL del request. */
function sesgoDeUrl(raiz) {
	const url = raiz.requestUrl ?? raiz.url ?? raiz.request?.url ?? null;
	if (typeof url !== 'string') return null;
	const lat = /[?&]latitude=([-\d.]+)/.exec(url)?.[1];
	const lon = /[?&]longitude=([-\d.]+)/.exec(url)?.[1];
	if (!lat || !lon) return { url, lat: null, lon: null };
	return { url, lat: Number(lat), lon: Number(lon) };
}

function leerArgs(argv) {
	const args = { archivo: null, superficie: '(no declarada)', termino: '(no declarado)' };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--superficie') args.superficie = argv[++i];
		else if (argv[i] === '--termino') args.termino = argv[++i];
		else if (!args.archivo) args.archivo = argv[i];
	}
	return args;
}

async function leerEntrada(archivo) {
	if (!archivo || archivo === '-') {
		const trozos = [];
		for await (const t of process.stdin) trozos.push(t);
		return Buffer.concat(trozos).toString('utf8');
	}
	const fs = await import('node:fs');
	return fs.readFileSync(archivo, 'utf8');
}

const args = leerArgs(process.argv.slice(2));
const crudo = await leerEntrada(args.archivo);

let raiz;
try {
	raiz = JSON.parse(crudo);
} catch (e) {
	console.error(`[analizar] el payload no es JSON valido: ${e.message}`);
	console.error('[analizar] pegalo tal cual viene de la consola, con las llaves exteriores incluidas.');
	process.exit(1);
}

const lista = Array.isArray(raiz) ? raiz : (raiz.predictions ?? raiz.data ?? raiz.results ?? raiz.places ?? null);
if (!Array.isArray(lista)) {
	console.error('[analizar] no encontre el arreglo de predicciones. Claves de nivel superior:', Object.keys(raiz).join(', '));
	process.exit(1);
}

console.log('');
console.log('='.repeat(96));
console.log(`MG-116 · iOS · superficie: ${args.superficie}   ·   termino: ${args.termino}`);
console.log(`usuario: ${USUARIO.etiqueta}  (${USUARIO.lat} / ${USUARIO.lon})`);
console.log('='.repeat(96));

// --- 1) El sesgo enviado. Es el dato que decide; el resto es corroboracion.
const sesgo = sesgoDeUrl(raiz);
let veredictoSesgo = null;
if (sesgo?.lat != null) {
	const s = { lat: sesgo.lat, lon: sesgo.lon };
	const dUsuario = haversineKm(s, USUARIO);
	const dUs = haversineKm(s, CARRIER_US);
	const dAr = haversineKm(s, CARRIER_AR);
	console.log('');
	console.log('SESGO ENVIADO POR LA APP (leido del request, no inferido)');
	console.log(`  coordenadas      : ${s.lat} / ${s.lon}`);
	console.log(`  al usuario       : ${fmtDist(dUsuario)}`);
	console.log(`  al carrier US    : ${fmtDist(dUs)}   (${CARRIER_US.etiqueta})`);
	console.log(`  al carrier AR    : ${fmtDist(dAr)}`);
	if (dUs < 1) {
		veredictoSesgo = 'FAIL';
		console.log(`  -> FAIL: el sesgo ES la direccion registrada del carrier USA. El fix NO entro en iOS.`);
	} else if (dUsuario <= TOLERANCIA_KM) {
		veredictoSesgo = 'PASS';
		console.log(`  -> PASS: el sesgo esta a ${fmtDist(dUsuario)} del usuario, dentro de la tolerancia de ${TOLERANCIA_KM} km.`);
	} else {
		veredictoSesgo = 'FAIL';
		console.log(`  -> FAIL: el sesgo esta a ${fmtDist(dUsuario)} del usuario, fuera de la tolerancia de ${TOLERANCIA_KM} km.`);
	}
} else {
	console.log('');
	console.log('SESGO ENVIADO: no disponible — el payload no trae la URL del request.');
	console.log('  El veredicto de abajo se INFIERE de los resultados, que es evidencia mas debil:');
	console.log('  un ranking correcto puede convivir con un sesgo mal apuntado si el termino es muy especifico.');
	if (sesgo?.url) console.log(`  (habia una URL pero sin latitude/longitude: ${sesgo.url.slice(0, 120)})`);
}

// --- 2) Las predicciones, ordenadas como las devolvio el backend.
console.log('');
console.log('PREDICCIONES, en el orden recibido');
const filas = [];
lista.forEach((p, i) => {
	const c = coordsDe(p);
	const et = etiquetaDe(p);
	const iata = p.iataCode ?? p.iata ?? p.airportIata ?? null;
	if (!c) {
		console.log(`  ${String(i + 1).padStart(2)}. ${et}${iata ? `  [IATA ${iata}]` : ''}   — sin coordenadas en el payload`);
		filas.push({ i: i + 1, et, km: null, iata });
		return;
	}
	const km = haversineKm(c, USUARIO);
	filas.push({ i: i + 1, et, km, iata });
	console.log(`  ${String(i + 1).padStart(2)}. ${fmtDist(km).padStart(9)} del usuario   ${et}${iata ? `  [IATA ${iata}]` : ''}`);
});

// --- 3) Lo que el criterio de aceptacion pide, y si se cumple.
const conKm = filas.filter(f => f.km != null);
const tresPrimeras = conKm.slice(0, 3);
const cercanasEnTop3 = tresPrimeras.filter(f => f.km <= 10).length;
const aeropuertosArriba = filas.slice(0, 3).filter(f => f.iata).length;

console.log('');
console.log('CRITERIO DE ACEPTACION');
console.log(`  AC del sesgo: al menos 1 de las 3 primeras a <= 10 km del usuario  ->  ${cercanasEnTop3 >= 1 ? 'CUMPLE' : 'NO CUMPLE'} (${cercanasEnTop3} de 3)`);
if (aeropuertosArriba > 0) {
	console.log(`  OJO: ${aeropuertosArriba} de las 3 primeras son aeropuertos con IATA. Eso es TM-727 (backend, lo cierra MG-931),`);
	console.log('       NO el sesgo. Se registra aparte para no atribuirle al fix un defecto que no es suyo.');
}

console.log('');
console.log('VEREDICTO');
if (veredictoSesgo) {
	console.log(`  sesgo (medido en el request): ${veredictoSesgo}`);
} else {
	console.log(`  sesgo (inferido de resultados): ${cercanasEnTop3 >= 1 ? 'compatible con PASS' : 'compatible con FAIL'} — sin el request no es concluyente`);
}
console.log('');
