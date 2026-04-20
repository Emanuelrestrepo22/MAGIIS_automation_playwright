/**
 * IDs canónicos de tipos de servicio en ambiente TEST.
 * Usados por helpers que interactúan con la API /magiis-v0.2/serviceType/*.
 */
export const SERVICE_TYPES = {
	/** Tipo "Regular" — viaje estándar. Límite ilimitado en config. */
	REGULAR: 226,
} as const;

export type ServiceTypeId = typeof SERVICE_TYPES[keyof typeof SERVICE_TYPES];
