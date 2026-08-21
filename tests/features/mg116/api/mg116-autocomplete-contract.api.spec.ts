/**
 * MG-116 — contrato de `places/autocomplete`, sin dispositivo.
 *
 * QUE CUBRE ESTA SUITE, y por que existe separada de la Appium. La regresion completa de MG-116
 * corria 100% sobre UN telefono fisico: cada corrida ~15 min, serializada, y el harness caia bajo
 * presion de memoria (ver `.claude/plans/dreamy-herding-lark.md`). De los casos del ROI, una parte
 * no depende de que el CLIENTE escriba el request — son un hecho del RESPONSE del backend, y esos
 * bajan aca. Los que dependen de conducta del cliente (debounce, quien manda el sesgo, el
 * sessionToken) NO bajan: si YO construyo el request, aserter que "lleva el sesgo" no prueba nada
 * del producto. Esa es la pregunta que decide, caso por caso, en el plan.
 *
 * AUTENTICACION. `PlacesAutocompleteApi.loginPassenger()` resuelve el login por HTTP puro con
 * `RoleToAttempt: ROLE_PASSENGER` — ver el docstring del componente para el porque no se extendio
 * el sistema generico de `AppRole`. Las credenciales salen de `PASSENGER_APP_USER`, el mismo fixture
 * que ya usa la suite Appium (arreglado el 2026-08-20 para leer `USER_PASSENGER`/`PASS_PASSENGER`
 * de `.env.uat`).
 *
 * POR QUE EL LOGIN VA EN CADA TEST Y NO EN UN beforeAll. Playwright prohibe reusar el fixture
 * `request` de un `beforeAll` dentro de un test ("Fixture { request } from beforeAll cannot be
 * reused in a test") — medido al primer intento. El token se cachea a nivel de modulo, asi que el
 * POST /auth/login se hace UNA vez por worker aunque `loginOnce()` se llame en los tres tests.
 *
 * PRECONDICION. `ENV=uat` con `USER_PASSENGER`/`PASS_PASSENGER` (o su forma con sufijo de ambiente)
 * seteados. Sin login exitoso, cada test se saltea con el motivo real — nunca un rojo por
 * credenciales ausentes, que no es un defecto del producto.
 */

import type { APIRequestContext } from '@playwright/test';

import { test, expect } from '@TestFixture';
import { PlacesAutocompleteApi } from '@api/PlacesAutocompleteApi';
import { airportsBeforeFirstCache, isPlusCode } from '@utils/mg116/addressVerdict';

/** Reconquista 661, CABA — el punto de referencia de toda la campana de MG-116. */
const USER_POS = { latitude: -34.6009, longitude: -58.3731 };

/** Token cacheado por worker: el login es identico entre tests y no aporta re-hacerlo. */
let cachedToken: string | null = null;
let loginFailure: string | null = null;

/**
 * Devuelve un componente ya autenticado, o null si el login no fue posible.
 *
 * No lanza: un login fallido es un problema de ambiente o credenciales, no un defecto del endpoint,
 * y el llamador lo traduce a skip-con-motivo.
 */
async function authenticatedApi(request: APIRequestContext): Promise<PlacesAutocompleteApi | null> {
	const api = new PlacesAutocompleteApi({ request });

	if (cachedToken) {
		api.setAuthToken(cachedToken);
		return api;
	}
	if (loginFailure) return null;

	const { response, status, body } = await api.loginPassenger();
	if (!response.ok() || !api.authToken) {
		loginFailure = `Login del pasajero fallo (status ${status}): ${JSON.stringify(body).slice(0, 200)}`;
		return null;
	}
	cachedToken = api.authToken;
	return api;
}

test.describe('[MG-116][API] Contrato de places/autocomplete — sin dispositivo @mg116 @regression', () => {
	test('TM-727: las direcciones cercanas al usuario no deberian rankear detras de aeropuertos que matchean por nombre', { annotation: [{ type: 'tms', description: 'TM-727' }] }, async ({ request }) => {
		const api = await authenticatedApi(request);
		test.skip(!api, loginFailure ?? 'sin sesion');

		// 'corr' es el termino medido en toda la campana: matchea aeropuertos por NOMBRE (Corrado
		// Gex, Corryong) ademas de direcciones de Corrientes en CABA. Con el sesgo apuntando al
		// usuario, el AC dice que una direccion cercana deberia aparecer ANTES que aeropuertos a
		// miles de km — hoy no es asi, y este test lo deja en rojo hasta que MG-931 lo resuelva.
		const [response, rows] = await api!.autocomplete({
			address: 'corr',
			latitude: USER_POS.latitude,
			longitude: USER_POS.longitude
		});

		expect(response.ok(), `esperaba 200, obtuve ${response.status()}`).toBe(true);
		expect(rows.length, 'esperaba al menos una prediccion para "corr"').toBeGreaterThan(0);

		const { firstCacheIndex, airportsAhead } = airportsBeforeFirstCache(rows);
		expect(firstCacheIndex, 'ninguna fila source=CACHE en la respuesta — no se puede evaluar el orden').toBeGreaterThanOrEqual(0);

		// Este es el assert que MG-931 tiene que poner en verde. Se documenta el estado medido en
		// el mensaje de falla para que el reporte de Allure sea auditable sin abrir el JSON.
		expect(
			airportsAhead,
			`${airportsAhead} aeropuerto(s) rankean antes de la primera direccion de cache (indice ${firstCacheIndex}). ` +
				`Filas: ${rows
					.slice(0, firstCacheIndex + 1)
					.map(r => `${r.source}:${r.mainText}`)
					.join(' | ')}`
		).toBe(0);
	});

	test(
		'TM-676/677/683/684: contrato de campos — cada prediccion trae exactamente los 9 campos documentados',
		{
			annotation: [
				{ type: 'tms', description: 'TM-676' },
				{ type: 'tms', description: 'TM-677' },
				{ type: 'tms', description: 'TM-683' },
				{ type: 'tms', description: 'TM-684' }
			]
		},
		async ({ request }) => {
			const api = await authenticatedApi(request);
			test.skip(!api, loginFailure ?? 'sin sesion');

			// Termino elegido para mezclar los dos origenes que el contrato distingue: 'corr' con
			// sesgo en CABA produce tanto AIRPORT como CACHE en la misma respuesta (medido el
			// 2026-08-19 y reconfirmado el 2026-08-21).
			const [response, rows] = await api!.autocomplete({
				address: 'corr',
				latitude: USER_POS.latitude,
				longitude: USER_POS.longitude
			});

			expect(response.ok(), `esperaba 200, obtuve ${response.status()}`).toBe(true);
			expect(rows.length).toBeGreaterThan(0);

			const expectedKeys = ['placeId', 'mainText', 'secondaryText', 'shortName', 'latitude', 'longitude', 'airport', 'iataCode', 'source'].sort();

			for (const row of rows) {
				const keys = Object.keys(row).sort();
				expect(keys, `fila "${row.mainText}" trae claves distintas a las 9 del contrato: ${keys.join(',')}`).toEqual(expectedKeys);

				// TM-684: placeId es null en filas AIRPORT (no vienen de Google Places) y no-null en CACHE.
				if (row.source === 'AIRPORT') {
					expect(row.placeId, `fila AIRPORT "${row.mainText}" trae placeId no nulo`).toBeNull();
					expect(row.iataCode, `fila AIRPORT "${row.mainText}" sin iataCode`).not.toBeNull();
				}
				if (row.source === 'CACHE') {
					expect(row.placeId, `fila CACHE "${row.mainText}" trae placeId nulo`).not.toBeNull();
				}
			}
		}
	);

	test('TM-691: medir cuantos plus codes expone la cache de magiis_place (calidad de dato — MG-931)', { annotation: [{ type: 'tms', description: 'TM-691' }] }, async ({ request }) => {
		const api = await authenticatedApi(request);
		test.skip(!api, loginFailure ?? 'sin sesion');

		// 'ezei' es el termino que en Perfil > Direcciones midio 4 plus codes de 8 filas el
		// 2026-08-20 (evidencia: ios-s7-dir-ezei.json). Se re-verifica aca a nivel de contrato del
		// backend, no de una pantalla puntual: si el backend limpia la cache, la medicion baja sin
		// tocar el test.
		const [response, rows] = await api!.autocomplete({ address: 'ezei' });

		expect(response.ok(), `esperaba 200, obtuve ${response.status()}`).toBe(true);
		expect(rows.length, 'esperaba al menos una prediccion para "ezei"').toBeGreaterThan(0);

		const plusCodeRows = rows.filter(r => isPlusCode(r.mainText));
		test.info().annotations.push({
			type: 'medicion',
			description: `${plusCodeRows.length} de ${rows.length} filas son plus codes${plusCodeRows.length ? `: ${plusCodeRows.map(r => r.mainText).join(', ')}` : ''}`
		});

		// NO se asierta 0 plus codes a proposito: el AC de MG-116 es el endpoint propio, no la
		// limpieza de la cache — eso es MG-931 (reportado en su comentario 35488). Poner un assert
		// duro aca pintaria de rojo a MG-116 por un defecto que no es suyo. Este test deja el
		// numero medido y auditable en el reporte, que es lo que MG-931 necesita para saber si su
		// fix funciono.
		expect(
			rows.every(r => typeof r.mainText === 'string' && r.mainText.length > 0),
			'toda fila debe traer un mainText no vacio'
		).toBe(true);
	});
});
