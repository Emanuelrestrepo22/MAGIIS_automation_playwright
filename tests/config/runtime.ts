// Este módulo es la "fuente de verdad" para resolver roles, credenciales,
// rutas de login y archivos de storageState según el entorno activo.
export const SUPPORTED_ROLES = ['carrier', 'contractor', 'web'] as const;

export type AppRole = (typeof SUPPORTED_ROLES)[number];
export type LoginRole = AppRole | 'pax';

export type RoleCredentials = {
	username: string;
	password: string;
};

export type RoleRuntimeConfig = {
	role: AppRole;
	env: string;
	baseURL: string;
	loginPath: string;
	authApiUrl: string | null;
	dashboardPattern: string;
	storageStatePath: string;
};

const DEFAULT_ROLE: AppRole = 'carrier';

// Valores por defecto que usamos cuando el .env no define una ruta específica por rol.
const DEFAULT_LOGIN_PATHS: Record<LoginRole, string> = {
	// Carrier migró al login single-page que vive bajo /#/authentication/login/carrier.
	carrier: '/#/authentication/login/carrier',
	contractor: '/contractor/#/auth/login',
	web: '/#/authentication/login',
	pax: '/#/authentication/login'
};

// Cada portal puede aterrizar en una URL distinta después del login,
// pero para este proyecto hoy todos comparten el patrón "dashboard".
const DEFAULT_DASHBOARD_PATTERNS: Record<AppRole, string> = {
	carrier: 'dashboard',
	contractor: 'dashboard',
	web: 'dashboard'
};

function isSupportedRole(value: string | undefined): value is AppRole {
	// Validamos el string externo antes de tratarlo como rol tipado.
	return value !== undefined && SUPPORTED_ROLES.includes(value as AppRole);
}

function getRoleEnvKey(prefix: string, role: AppRole): string {
	// Convierte, por ejemplo, ("USER", "carrier") en "USER_CARRIER".
	return `${prefix}_${role.toUpperCase()}`;
}

function readRoleFirstEnv(prefix: string, role: AppRole): string | undefined {
	// Primero intentamos la variable específica por rol y, si no existe,
	// usamos la variable genérica como fallback.
	return process.env[getRoleEnvKey(prefix, role)] ?? process.env[prefix];
}

export function getCurrentEnv(): string {
	// TEST es el entorno por defecto para no depender de ENV explícita en desarrollo.
	return process.env.ENV ?? 'test';
}

export function getEnvFile(): string {
	// Permitimos sobreescribir el archivo vía ENV_FILE, pero normalmente
	// seguimos la convención .env.<entorno>.
	return process.env.ENV_FILE ?? `.env.${getCurrentEnv()}`;
}

export function getDefaultRole(): AppRole {
	// Si TEST_ROLE viene mal configurado, caemos a carrier para mantener compatibilidad.
	return isSupportedRole(process.env.TEST_ROLE) ? process.env.TEST_ROLE : DEFAULT_ROLE;
}

export function hasRoleCredentials(role: AppRole): boolean {
	// Un rol se considera disponible solo si tiene usuario y contraseña resolubles.
	return Boolean(readRoleFirstEnv('USER', role) && readRoleFirstEnv('PASS', role));
}

export function getConfiguredRoles(): AppRole[] {
	// Filtra únicamente los roles que realmente pueden autenticarse con el .env actual.
	return SUPPORTED_ROLES.filter(role => hasRoleCredentials(role));
}

export function resolveRoleCredentials(role: AppRole): RoleCredentials {
	// Centralizamos la lectura de credenciales para que tests, fixtures y setups
	// fallen con el mismo mensaje si falta configuración.
	const username = readRoleFirstEnv('USER', role);
	const password = readRoleFirstEnv('PASS', role);

	if (!username) {
		throw new Error(`Missing ${getRoleEnvKey('USER', role)} or fallback USER in ${getEnvFile()}`);
	}

	if (!password) {
		throw new Error(`Missing ${getRoleEnvKey('PASS', role)} or fallback PASS in ${getEnvFile()}`);
	}

	return { username, password };
}

export function resolveLoginPath(role: LoginRole): string {
	// Permite customizar la ruta por rol sin duplicar lógica en los page objects.
	if (role === 'carrier') {
		// Carrier sí acepta el fallback global porque este proyecto usa LOGIN_PATH
		// como atajo para el portal carrier.
		return process.env.LOGIN_PATH_CARRIER ?? process.env.LOGIN_PATH ?? DEFAULT_LOGIN_PATHS.carrier;
	}

	if (role === 'contractor') {
		// Evitamos heredar LOGIN_PATH global para no mandar al contractor al login carrier.
		return process.env.LOGIN_PATH_CONTRACTOR ?? DEFAULT_LOGIN_PATHS.contractor;
	}

	if (role === 'web') {
		return process.env.LOGIN_PATH_WEB ?? DEFAULT_LOGIN_PATHS.web;
	}

	return process.env.PAX_LOGIN_PATH ?? DEFAULT_LOGIN_PATHS.pax;
}

export function resolveAuthApiUrl(role: AppRole): string | null {
	// Algunos portales exponen un endpoint propio; otros reutilizan AUTH_API_URL global.
	return readRoleFirstEnv('AUTH_API_URL', role) ?? process.env.AUTH_API_URL ?? null;
}

export function resolveDashboardPattern(role: AppRole): string {
	// Este patrón se usa en global setup para confirmar que el login salió del formulario.
	return readRoleFirstEnv('DASHBOARD_URL_PATTERN', role) ?? DEFAULT_DASHBOARD_PATTERNS[role];
}

export function getStorageStatePath(role: AppRole, env = getCurrentEnv()): string {
	// Un archivo por rol y entorno evita colisiones entre sesiones persistidas.
	return `storage/state-${role}-${env}.json`;
}

export function getRoleRuntimeConfig(role: AppRole): RoleRuntimeConfig {
	// Armamos un objeto listo para consumir desde fixtures y setups.
	const baseURL = process.env.BASE_URL;
	if (!baseURL) {
		throw new Error(`Missing BASE_URL in ${getEnvFile()}`);
	}

	return {
		role,
		env: getCurrentEnv(),
		baseURL,
		loginPath: resolveLoginPath(role),
		authApiUrl: resolveAuthApiUrl(role),
		dashboardPattern: resolveDashboardPattern(role),
		storageStatePath: getStorageStatePath(role)
	};
}
