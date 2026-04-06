export function getRequiredEnv(name: string): string {
	// Helper mínimo para fallar con un mensaje consistente cuando falta configuración.
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing ${name} environment variable`);
	}

	return value;
}

export function getPortalUrl(portal: 'carrier' | 'pax'): string {
	// Carrier acepta fallback a BASE_URL porque gran parte del framework
	// ya usa esa variable como URL principal del portal web.
	if (portal === 'carrier') {
		return process.env.CARRIER_URL ?? process.env.BASE_URL ?? getRequiredEnv('CARRIER_URL');
	}

	// Pax no tiene fallback genérico para evitar confusiones entre portales.
	return getRequiredEnv('PAX_URL');
}

export function getPortalCredentials(portal: 'carrier' | 'pax'): { user: string; pass: string } {
	// Carrier reutiliza las credenciales históricas del framework si existen.
	if (portal === 'carrier') {
		return {
			user: process.env.CARRIER_USER ?? process.env.USER_CARRIER ?? getRequiredEnv('CARRIER_USER'),
			pass: process.env.CARRIER_PASS ?? process.env.PASS_CARRIER ?? getRequiredEnv('CARRIER_PASS')
		};
	}

	// Para pax exigimos variables explícitas porque su login pertenece a otro portal.
	return {
		user: getRequiredEnv('PAX_USER'),
		pass: getRequiredEnv('PAX_PASS')
	};
}
