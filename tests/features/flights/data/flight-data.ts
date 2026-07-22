// tests/features/flights/data/flight-data.ts
// Datos propios de la feature flights (alta de viaje con vuelo). Derivados del recording
// `../recorded/alta-viaje-con-vuelo.recorded.ts` — la feature es autónoma, sin acoplar a gateway.
export const FLIGHT_TEST_DATA = {
	// El recording buscó "eman" y eligió al cliente "Restrepo, Emanuel (+549...)".
	client: 'Restrepo, Emanuel',
	// Typeahead de cliente (verificado UAT v1.72.6): término PARCIAL que dispara la búsqueda +
	// etiqueta COMPLETA de la opción a clickear (el teléfono desambigua homónimos).
	clientSearch: 'eman',
	clientOption: 'Restrepo, Emanuel (+549112404884)',
	// Dirección de origen (informativa) — en la práctica el ORIGEN auto-completa desde el cliente.
	origin: 'Reconquista 661',
	// El destino DEBE ser un aeropuerto para habilitar el botón de vuelo. Typeahead: "ezeiza".
	destinationSearch: 'ezeiza',
	airportDestination: 'Aeropuerto Internacional Ministro Pistarini',
	airportOption: /Aeropuerto Internacional/i,
	airlineQuery: 'argentina',
	airlineLabel: 'AR - Aerolíneas Argentinas',
	// La fila de vuelo a seleccionar (recorder-derived — confirmar contra UAT).
	flightLabel: /AR\d+ - Aerol[íi]neas Argentinas/,
	// Edición desde detalle (recording editar-vuelo-desde-detalle): cambio de aerolínea a Delta.
	changeAirlineQuery: 'delta',
	changeAirlineLabel: 'DL - Delta Air Lines',
	changeFlightLabel: /DL\d+ - Delta/,
	// TC17: número de vuelo inexistente → getFlights 200 [] → "No se encontraron vuelos" + "Ingreso Manual".
	missingFlightNumber: '00000'
} as const;
