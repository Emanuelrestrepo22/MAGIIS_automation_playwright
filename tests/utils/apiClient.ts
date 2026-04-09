// tests/utils/apiClient.ts
import type { APIRequestContext } from '@playwright/test';
import type { AppRole } from '../config/runtime';
import { getDefaultRole, resolveAuthApiUrl, resolveRoleCredentials } from '../config/runtime';

export class ApiClient {
	private readonly role: AppRole;
	private readonly authUrl: string | null;

	constructor(
		// Reutilizamos el request context nativo de Playwright para heredar
		// timeouts, tracing y manejo estándar de requests dentro de los tests.
		private readonly request: APIRequestContext,
		role: AppRole = getDefaultRole()
	) {
		this.role = role;
		this.authUrl = resolveAuthApiUrl(role);
	}

	async login(role: AppRole = this.role) {
		// Si no existe endpoint configurado, preferimos fallar acá con un error claro
		// antes que lanzar un request inválido más difícil de diagnosticar.
		if (!this.authUrl) {
			throw new Error(`Missing AUTH_API_URL for role ${role}`);
		}

		// El payload reutiliza las credenciales del rol actual para mantener
		// sincronía entre login UI y login API.
		const credentials = resolveRoleCredentials(role);
		const payload = {
			username: credentials.username,
			password: credentials.password
		};

		// Desactivamos failOnStatusCode porque en pruebas negativas o bugs de backend
		// queremos inspeccionar el status y el body manualmente.
		const response = await this.request.post(this.authUrl, {
			data: payload,
			headers: {
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'Content-Type': 'application/json',
				// eslint-disable-next-line @typescript-eslint/naming-convention
				Accept: 'application/json'
			},
			failOnStatusCode: false // NO tirar excepción automática; la controlamos nosotros
		});

		const status = response.status();
		const rawBody = await response.text();

		// Dejamos un log completo porque los fallos de auth suelen requerir
		// revisar payload, status y respuesta del backend en conjunto.
		console.log('[TS-AUTH-TC02][AUTH LOGIN] Request:', {
			role,
			url: this.authUrl,
			status,
			rawBody
		});

		return { response, status, rawBody };
	}

	async loginCarrier() {
		// Shortcut para el caso más frecuente del proyecto.
		return this.login('carrier');
	}
}
