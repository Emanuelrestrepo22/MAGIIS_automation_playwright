/**
 * KATA Component (Layer 3) — App PAX places/autocomplete contract API.
 *
 * MG-116 migro el autocomplete de direcciones de App PAX al endpoint propio
 * `magiis-v0.2/places/autocomplete`. Hasta hoy, el 100% de su cobertura era Appium sobre UN
 * dispositivo fisico: cada corrida serializaba, tardaba ~15 min, y el servidor UiAutomator2 se caia
 * bajo presion de memoria. Este componente exercita el contrato del ENDPOINT sin dispositivo, para
 * las conductas que son un hecho del response y no de que el cliente escriba en un campo — ver
 * `.claude/plans/dreamy-herding-lark.md` (`El criterio que decide si un caso baja o no`).
 *
 * AUTENTICACION — el hallazgo que desbloquea toda la suite. `ApiClient.login()` (el cliente
 * generico de `tests/shared/utils/apiClient.ts`) NO manda el header `RoleToAttempt`, y sin el,
 * `POST /auth/login` responde 500 en UAT para CUALQUIER rol (carrier incluido, no solo passenger:
 * verificado con curl el 2026-08-21). Con `RoleToAttempt: ROLE_<ROL>` responde 200. Este componente
 * lo manda directo porque `AppRole`/`SUPPORTED_ROLES` (`tests/config/runtime.ts`) esta atado a
 * conceptos de SPA web — `dashboardPattern`, `loginPath` como fragmento de URL, `storageStatePath`
 * para una sesion de browser — que no aplican a una app movil que nunca abre una pagina de
 * dashboard. Agregar `'passenger'` a ese union type es un cambio de superficie ancha (usado en
 * fixtures, storage state, TestBase) para un caso que no encaja en su forma; este componente evita
 * esa extension y resuelve el login por su cuenta, reusando SOLO el fixture de credenciales que ya
 * es el SoT (`PASSENGER_APP_USER`).
 *
 * Convencion KATA aplicada: extiende `ApiBase`, import por alias, metodos publicos fail-fast,
 * parametros 3+ como objeto.
 */

import type { APIResponse } from '@playwright/test';

import { ApiBase } from '@api/ApiBase';
import { getCurrentUserEnvironment, PASSENGER_APP_USER } from '@fixtures/users';
import type { PlaceRow } from '@utils/mg116/addressVerdict';

const LOGIN_PATH = '/magiis-v0.2/auth/login';
const AUTOCOMPLETE_PATH = '/magiis-v0.2/places/autocomplete';

export type PassengerLoginResult = {
	response: APIResponse;
	status: number;
	body: { userId?: number; token?: string; roleUser?: string; enabledUser?: string } | Record<string, unknown>;
};

export type AutocompleteParams = {
	address: string;
	latitude?: number;
	longitude?: number;
	sessionToken?: string;
};

export class PlacesAutocompleteApi extends ApiBase {
	/**
	 * Login del pasajero por HTTP puro, sin dispositivo ni WebView.
	 *
	 * Falla fast si faltan credenciales — el fixture ya lo hace (`requireEnv` lanza nombrando la
	 * variable exacta y el ambiente activo), asi que este metodo no duplica esa validacion.
	 */
	async loginPassenger(): Promise<PassengerLoginResult> {
		const user = PASSENGER_APP_USER[getCurrentUserEnvironment()];
		const [response, body] = await this.apiPOST<PassengerLoginResult['body']>(LOGIN_PATH, { username: user.email, password: user.password }, { headers: { RoleToAttempt: 'ROLE_PASSENGER' } });

		if (response.ok() && typeof body === 'object' && body && 'token' in body && typeof body.token === 'string') {
			this.setAuthToken(body.token);
		}

		return { response, status: response.status(), body };
	}

	/**
	 * GET places/autocomplete con el token ya seteado por `loginPassenger()`.
	 *
	 * Params opcionales: sin latitude/longitude el backend no aplica sesgo geografico (medido con
	 * curl el 2026-08-19 y el 2026-08-21) — util para los tests de contrato que no dependen del sesgo.
	 */
	async autocomplete(params: AutocompleteParams): Promise<[APIResponse, PlaceRow[]]> {
		const query: Record<string, string> = { address: params.address };
		if (params.latitude !== undefined) query.latitude = String(params.latitude);
		if (params.longitude !== undefined) query.longitude = String(params.longitude);
		if (params.sessionToken !== undefined) query.sessionToken = params.sessionToken;

		const [response, body] = await this.apiGET<PlaceRow[]>(AUTOCOMPLETE_PATH, { params: query });
		return [response, Array.isArray(body) ? body : []];
	}
}
