/**
 * Etiquetas bilingües EN|ES para selectores por texto de la feature de cupo.
 *
 * La app MAGIIS tiene toggle de idioma (ES/EN) por cuenta; el spec NO fija el idioma —
 * acepta AMBOS para que corra sea cual sea el locale activo. Cada etiqueta es un RegExp
 * case-insensitive `EN|ES`. Donde el string ES aún no se verificó en vivo va marcado
 * TODO(i18n) (el EN viene del recording tests/test-1.spec.ts; el ES, de la sesión en vivo).
 */

/** Une variantes EN/ES en un RegExp case-insensitive para usar como `name` en getByRole/getByText. */
export const rx = (...variants: string[]): RegExp => new RegExp(variants.join('|'), 'i');

export const L = {
	// Navegación / config — ES verificado en vivo, EN del recording.
	newTrip: rx('New trip', 'Nuevo Viaje'),
	serviceTypes: rx('Service Types', 'Tipos de Servicios'),
	newServiceType: rx('New Service Type', 'Nuevo Tipo de Servicio'),
	update: rx('Update', 'Actualizar'),
	quantity: rx('Quantity', 'Cantidad'),
	search: rx('Search', 'Buscar'),

	// Flujo profundo — EN del recording; ES por confirmar en un pase en vivo.
	associates: rx('Associates', 'Asociados'), // TODO(i18n): confirmar ES
	selectVehicle: rx('Select Vehicle', 'Seleccionar Vehículo'), // TODO(i18n): confirmar ES
	sendManual: rx('Send Manual', 'Envío Manual'), // TODO(i18n): confirmar ES
	sendService: rx('Send Service', 'Enviar Servicio'),
	confirmReset: rx('Confirm Reset', 'Confirmar Reset'), // TODO(i18n): confirmar ES
	serviceUsageLimitExceeded: rx('Service Usage Limit Exceeded', 'Límite de Uso de Servicio Excedido'), // TODO(i18n): confirmar ES
	accept: rx('Accept', 'Aceptar'),
	close: rx('Close', 'Cerrar'),

	// Alta de viaje / navegación (EN del recording; ES verificado en vivo salvo TODO).
	selectUser: rx('Select User', 'Seleccione Usuario'),
	userToSearch: rx('User to Search', 'Usuario a Buscar'),
	enterAddress: rx('Enter an address', 'Ingrese una dirección'),
	customers: rx('Customers', 'Clientes'),
	corporationsManagement: rx('Corporations Management', 'Gestión Empresas'),
	configuration: rx('Configuration', 'Configuración')
} as const;

/** Períodos de cupo, bilingües. */
export const PERIOD = {
	daily: rx('Daily', 'Diaria'),
	weekly: rx('Weekly', 'Semanal'),
	monthly: rx('Monthly', 'Mensual')
} as const;

export type PeriodKey = keyof typeof PERIOD;
