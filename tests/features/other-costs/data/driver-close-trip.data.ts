/**
 * Datos de la smoke «el chofer carga un concepto Fijo al cerrar el viaje» (TM-1099).
 *
 * Origen: campaña UAT de Universal F1 del 29/09/2026 (carrier 1481 Unity Transfers, chofer
 * Ayrton Senna 0504). El body del alta es el que manda el formulario «New Trip» del portal
 * carrier V2 v2.0.17, capturado en esa campaña (viajes 723138..723155). Sólo UAT está relevado:
 * cualquier otro ambiente falla en vez de usar ids de otro entorno.
 */

export type GeoPoint = { longitude: number; latitude: number };

export type DriverCloseTripData = {
	carrierId: number;
	/** Usuario chofer que recibe el viaje (Ayrton Senna 0504). */
	driverUserId: number;
	passengerUserId: number;
	serviceTypeId: string;
	vehicleTypeId: number;
	currencyId: number;
	origin: GeoPoint & { placeId: string; shortName: string };
	destination: GeoPoint & { placeId: string; shortName: string };
	/** Posición de reposo del emulador, que se restaura al terminar. */
	restGps: GeoPoint;
	/** Concepto Fijo que se crea para la corrida. */
	concept: { saleValue: number; costValue: number };
};

const DATA_BY_ENV: Record<string, DriverCloseTripData> = {
	uat: {
		carrierId: 1481,
		driverUserId: 6033,
		passengerUserId: 141858,
		serviceTypeId: '372',
		vehicleTypeId: 1,
		currencyId: 9,
		origin: {
			longitude: -58.45901,
			latitude: -34.56151,
			placeId: 'ChIJ1TTt69S1vJURa1ppgy2gVfI',
			shortName: 'Ciudad de la Paz 2238, Ciudad Autónoma de Buenos Aires, Argentina'
		},
		destination: {
			longitude: -58.4527395,
			latitude: -34.5599602,
			placeId:
				'ElFBdmVuaWRhIEp1cmFtZW50byAyMDAwLCBDaXVkYWQgQXV0w7Nub21hIGRlIEJ1ZW5vcyBBaXJlcywgQnVlbm9zIEFpcmVzLCBBcmdlbnRpbmEiMRIvChQKEgkJlC6R0rW8lRFOAPskLRJpDRDQDyoUChIJ2Spmtni2vJURQ9n1ArFurwU',
			shortName: 'Avenida Juramento 2000, Ciudad Autónoma de Buenos Aires, Buenos Aires, Argentina'
		},
		restGps: { longitude: -58.3849476, latitude: -34.5944052 },
		concept: { saleValue: 10, costValue: 4 }
	}
};

export function getDriverCloseTripData(env: string): DriverCloseTripData {
	const data = DATA_BY_ENV[env];
	if (!data) {
		throw new Error(
			`[other-costs] no hay datos relevados para ENV=${env}; sólo: ${Object.keys(DATA_BY_ENV).join(', ')}`
		);
	}
	return data;
}

/**
 * Id de corrida `MMddHHmmss` (UTC, 10 dígitos): sin guiones porque el ABM sólo acepta letras,
 * números y espacios, y corto porque la App Driver valida el nombre del concepto con
 * `maxLength(25)` (travel-add-other.ts): con un nombre más largo «Save» queda deshabilitado.
 */
export function newRunId(now: Date = new Date()): string {
	return now
		.toISOString()
		.replace(/[-:TZ.]/g, '')
		.slice(4, 14);
}

/** Límite y alfabeto que la App Driver acepta para el nombre del concepto (travel-add-other.ts). */
export const DRIVER_APP_CONCEPT_NAME = { maxLength: 25, pattern: /^[A-Za-z0-9_.ñÑ ]+$/ } as const;

/** Falla antes de crear datos si el nombre no entra en el formulario de la App Driver. */
export function assertDriverAppConceptName(name: string): void {
	if (name.length > DRIVER_APP_CONCEPT_NAME.maxLength || !DRIVER_APP_CONCEPT_NAME.pattern.test(name)) {
		throw new Error(
			`[other-costs] «${name}» no es un nombre que la App Driver pueda guardar (máx. ${DRIVER_APP_CONCEPT_NAME.maxLength}, [A-Za-z0-9_.ñÑ ])`
		);
	}
}

const FIX_CONCEPT_LIST = [
	[30, 1, 'FARE'],
	[71, 2, 'WAIT'],
	[113, 3, 'PARKING'],
	[155, 4, 'TOLL'],
	[197, 5, 'OTHER_COST'],
	[239, 6, 'TIPS']
].map(([id, conceptCode, name]) => ({
	id,
	conceptCode,
	name,
	fixValue: null,
	fixAmount: null,
	conceptVersion: 1,
	taxesAmount: 0,
	deleted: false,
	taxesList: []
}));

/**
 * Body del alta tal como lo arma el formulario «New Trip» del portal (pago en efectivo, sin otros
 * costos, asignación especial). El medio de pago real se elige en la app al cerrar.
 */
export function buildTripCreateBody(
	data: DriverCloseTripData,
	opts: { operatorUserId: number; note: string }
): Record<string, unknown> {
	const place = (p: DriverCloseTripData['origin']) => ({
		longitude: String(p.longitude),
		latitude: String(p.latitude),
		placeId: p.placeId,
		shortName: p.shortName,
		additionalInfo: null,
		specialInstruction: '',
		floorApt: '',
		waitTime: null
	});
	return {
		carrierUserId: data.carrierId,
		passengerUserId: data.passengerUserId,
		requesterUserId: data.passengerUserId,
		origin: place(data.origin),
		destination: place(data.destination),
		waypoints: null,
		paymentMethod: 'CASH',
		vehicleTypeId: data.vehicleTypeId,
		isRental: false,
		rentalType: 'KMS_INCLUDED_PER_HOUR',
		rentalHours: '3',
		avoidTolls: true,
		avoidHighways: true,
		fastestRoute: true,
		isProgrammed: false,
		dateProgrammed: null,
		driverProgrammedId: 0,
		recurringValue: null,
		recurringEnd: null,
		recurringPattern: null,
		selectedDaysOfWeek: null,
		airlineName: null,
		departArrival: null,
		flightNumber: null,
		departReturnSchedule: null,
		pickupGmt: 'America/Argentina/Buenos_Aires',
		isDelivery: false,
		roundTrip: false,
		hasGuestPassenger: false,
		guestPassengerName: '',
		note: opts.note,
		serviceTypeId: data.serviceTypeId,
		areaId: null,
		paxQty: 1,
		pbxCaller: false,
		platform: 'Web',
		tipPercentage: null,
		tipAmount: null,
		fixedCost: null,
		multiTripSeq: null,
		otherCosts: null,
		calculateTaxes: false,
		affiAgreementId: null,
		operatorUserId: opts.operatorUserId,
		firstName: null,
		lastName: null,
		mail: null,
		phoneNumber: null,
		travelPreferences: {
			airConditioner: false,
			luggage: false,
			mascots: false,
			vehicleTypeId: data.vehicleTypeId,
			driverUserId: null
		},
		driverInstructions: '',
		fixConceptList: FIX_CONCEPT_LIST,
		fixConceptsCost: 0,
		taxesCost: 0,
		qrPayment: false,
		contractorEmployeeId: null,
		cardDetail: null,
		originToken: 'null',
		exceedingLimitAllow: false,
		createdBy: 'CARRIER',
		isSpecialAssign: true
	};
}
