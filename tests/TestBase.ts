import { test as base, expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import type { AppRole, RoleCredentials, RoleRuntimeConfig } from './config/runtime';
import { getDefaultRole, getRoleRuntimeConfig, resolveRoleCredentials } from './config/runtime';
import { LoginPage } from './pages/shared/LoginPage';
import { ApiClient } from './shared/utils/apiClient';

// Estas fixtures representan el "kit base" que casi todos los tests necesitan:
// contexto del rol, credenciales resueltas y helpers listos para usar.
type Fixtures = {
	role: AppRole;
	roleConfig: RoleRuntimeConfig;
	credentials: RoleCredentials;
	loginPage: LoginPage;
	apiClient: ApiClient;
};

const test = base.extend<Fixtures>({
	// Permite que cada spec defina un rol distinto con test.use({ role: '...' }).
	role: [getDefaultRole(), { option: true }],

	// Expone la configuración derivada del rol sin recalcularla en cada test.
	roleConfig: async ({ role }, use: (roleConfig: RoleRuntimeConfig) => Promise<void>) => {
		await use(getRoleRuntimeConfig(role));
	},

	// Resuelve usuario y contraseña en un solo lugar para mantener consistencia.
	credentials: async ({ role }, use: (credentials: RoleCredentials) => Promise<void>) => {
		await use(resolveRoleCredentials(role));
	},

	// Entrega un page object de login listo para el rol actual.
	loginPage: async ({ page, role }: { page: Page; role: AppRole }, use: (loginPage: LoginPage) => Promise<void>) => {
		const loginPage = new LoginPage(page, role);
		await use(loginPage);
	},

	// Expone un cliente API alineado con el mismo rol del test para combinar
	// checks UI y backend sin duplicar wiring.
	apiClient: async ({ request, role }: { request: APIRequestContext; role: AppRole }, use: (apiClient: ApiClient) => Promise<void>) => {
		const apiClient = new ApiClient(request, role);
		await use(apiClient);
	}
});

export { test, expect };
