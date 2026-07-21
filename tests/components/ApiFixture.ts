/**
 * KATA Architecture — Layer 4: API Fixture.
 *
 * Contenedor de inyección de dependencias de los componentes API. Todos comparten el
 * mismo request context (misma autenticación y configuración).
 *
 * Aún sin componentes API KATA en este repo (los packs API de gateway-pg viven en
 * tests/features/gateway-pg/api/ con su propio wiring). CÓMO AGREGAR uno:
 *   1. Creá el componente en tests/components/api/YourApi.ts (extends ApiBase).
 *   2. Importalo, declaralo readonly, inicializalo con las options.
 *   3. Propagá el token en un override de setAuthToken/clearAuthToken.
 */

import type { TestContextOptions } from '@TestContext';

import { ApiBase } from '@api/ApiBase';

export class ApiFixture extends ApiBase {
	constructor(options: TestContextOptions) {
		super(options);
	}
}
