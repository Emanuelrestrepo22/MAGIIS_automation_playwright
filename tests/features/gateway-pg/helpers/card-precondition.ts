/**
 * card-precondition.ts — Helpers de precondición para validar tarjetas vinculadas
 * antes de ejecutar tests de hold/cargo-a-bordo.
 *
 * Dos mecanismos:
 *   1. API: POST paymentMethodsByPax → valida tarjetas vinculadas sin UI
 *   2. Front-end: abre dropdown de pago en form Alta de Viaje → verifica opciones visibles
 *
 * Endpoints descubiertos vía recording test-22.spec.ts + network capture:
 *   - GET  /magiis-v0.2/passengers/carrier/{carrierId}?lastName={query} → passengerUserId
 *   - POST /magiis-v0.2/carriers/{carrierId}/paymentMethodsByPax → cards[]
 */
import type { Page } from '@playwright/test';

/** Carrier ID del ambiente TEST (confirmado en .env.test y specs) */
const DEFAULT_CARRIER_ID = process.env.CARRIER_ID ?? '1521';

/** Respuesta de la API paymentMethodsByPax */
export interface PassengerCard {
	id: number;
	cardId: string;
	appCode: string;
	lastFourDigits: string;
	paymentMethodId: string; // 'visa', 'mastercard', etc.
	cardholder: string;
	expired: boolean;
	defaultCard: boolean;
	expirationYear: number;
	expirationMonth: number;
}

export interface PaymentMethodsByPaxResponse {
	paymentMethods: string[];
	cards: PassengerCard[];
	defaultPaymentMethods: string;
}

export interface PassengerSearchResult {
	passengerUserId: number;
	[key: string]: unknown;
}

/**
 * Resuelve la base URL de la API desde la URL actual del page o env.
 * Ejemplo: "https://apps-test.magiis.com" → "https://apps-test.magiis.com/magiis-v0.2"
 */
function resolveApiBase(page: Page): string {
	const baseUrl = process.env.BASE_URL ?? new URL(page.url()).origin;
	return `${baseUrl}/magiis-v0.2`;
}

/** Cached token — se extrae una sola vez por page y se reutiliza */
const tokenCache = new WeakMap<Page, string>();

/**
 * Guarda el token extraído en el cache (exportado para que otros helpers
 * puedan alimentar el cache desde requests interceptados en el flujo normal).
 */
export function cacheAuthToken(page: Page, authHeader: string): void {
	if (authHeader) tokenCache.set(page, authHeader);
}

/**
 * Extrae el token de autenticación interceptando un request real del SPA Angular.
 * El SPA NO guarda el JWT en localStorage ni cookies — lo mantiene en memoria
 * y lo envía como header `Authorization: Bearer ...` en cada API call.
 *
 * Estrategia: instalar un route handler transparente que captura el Authorization
 * header sin modificar el request. Se resuelve cuando el SPA hace su próximo API call.
 * Precondición: el page debe estar logueado (post loginAsDispatcher).
 */
export async function extractAuthToken(page: Page): Promise<string | null> {
	// Revisar cache primero
	const cached = tokenCache.get(page);
	if (cached) return cached;

	// Instalar interceptor transparente (no modifica el request, solo lee el header)
	let resolveToken: (token: string | null) => void;
	const tokenPromise = new Promise<string | null>((resolve) => {
		resolveToken = resolve;
		// Timeout: si no se captura en 8s, devolver null
		setTimeout(() => resolve(null), 8_000);
	});

	const handler = async (route: import('@playwright/test').Route) => {
		const authHeader = route.request().headers()['authorization'];
		if (authHeader) {
			tokenCache.set(page, authHeader);
			resolveToken!(authHeader);
		}
		await route.continue();
	};

	await page.route('**/magiis-v0.2/**', handler);

	// Forzar un API call del SPA recargando la página actual (no cambia de URL)
	await page.reload({ waitUntil: 'domcontentloaded' });

	const token = await tokenPromise;

	// Limpiar el handler para no interferir con otros requests
	await page.unroute('**/magiis-v0.2/**', handler);

	return token;
}

/** Headers de autenticación para las llamadas API */
export async function getApiHeaders(page: Page): Promise<Record<string, string>> {
	const token = await extractAuthToken(page);
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (token) {
		headers['Authorization'] = token;
	}
	return headers;
}

/**
 * Busca el passengerId de un pasajero por apellido (o fragmento del nombre).
 *
 * Endpoint: GET /magiis-v0.2/passengers/carrier/{carrierId}?lastName={query}
 * Ejemplo: ?lastName=marce → passengerUserId: 4951 (Marcelle Stripe)
 */
export async function getPassengerId(
	page: Page,
	lastNameQuery: string,
	carrierId = DEFAULT_CARRIER_ID,
): Promise<number> {
	const apiBase = resolveApiBase(page);
	const url = `${apiBase}/passengers/carrier/${carrierId}?lastName=${encodeURIComponent(lastNameQuery)}`;
	const headers = await getApiHeaders(page);

	const response = await page.request.get(url, { headers });
	if (!response.ok()) {
		throw new Error(
			`[card-precondition] getPassengerId failed: ${response.status()} ${response.statusText()} — URL: ${url}`,
		);
	}

	const data = await response.json();
	// La API devuelve un array de pasajeros. Tomamos el primero que tenga passengerUserId.
	const passengers: PassengerSearchResult[] = Array.isArray(data) ? data : [data];
	const match = passengers.find((p) => typeof p.passengerUserId === 'number');

	if (!match) {
		throw new Error(
			`[card-precondition] No se encontró pasajero con lastName="${lastNameQuery}". Response: ${JSON.stringify(data).slice(0, 500)}`,
		);
	}

	return match.passengerUserId;
}

/**
 * Obtiene las tarjetas vinculadas de un pasajero via API.
 *
 * Endpoint: POST /magiis-v0.2/carriers/{carrierId}/paymentMethodsByPax
 * Payload: { passengerId, typeConfig: "CARRIER" }
 */
export async function getPassengerCards(
	page: Page,
	passengerId: number,
	carrierId = DEFAULT_CARRIER_ID,
): Promise<PaymentMethodsByPaxResponse> {
	const apiBase = resolveApiBase(page);
	const url = `${apiBase}/carriers/${carrierId}/paymentMethodsByPax`;
	const headers = await getApiHeaders(page);

	const response = await page.request.post(url, {
		data: { passengerId, typeConfig: 'CARRIER' },
		headers,
	});

	if (!response.ok()) {
		throw new Error(
			`[card-precondition] getPassengerCards failed: ${response.status()} ${response.statusText()} — URL: ${url}`,
		);
	}

	return response.json() as Promise<PaymentMethodsByPaxResponse>;
}

/**
 * Verifica si un pasajero tiene al menos una tarjeta activa (no expirada)
 * con los últimos 4 dígitos especificados.
 */
export function hasActiveCardWithLast4(cards: PassengerCard[], last4: string): boolean {
	return cards.some((card) => card.lastFourDigits === last4 && !card.expired);
}

/**
 * Cuenta cuántas tarjetas activas tiene el pasajero.
 * Útil para detectar exceso de tarjetas (Stripe limita a ~100 por customer).
 */
export function countActiveCards(cards: PassengerCard[]): number {
	return cards.filter((card) => !card.expired).length;
}

/** Umbral máximo de tarjetas por pasajero antes de limpiar */
const MAX_CARDS_THRESHOLD = 20;

/**
 * Elimina una tarjeta vinculada de un pasajero vía API.
 *
 * Endpoint: DELETE /magiis-v0.2/users/{passengerId}/cards/{cardId}
 * Response: true
 *
 * Evidencia: network capture del portal carrier (2026-04-16).
 */
export async function deletePassengerCard(
	page: Page,
	passengerId: number,
	cardId: number,
): Promise<boolean> {
	const apiBase = resolveApiBase(page);
	const url = `${apiBase}/users/${passengerId}/cards/${cardId}`;
	const headers = await getApiHeaders(page);

	const response = await page.request.delete(url, { headers });
	if (!response.ok()) {
		console.warn(
			`[card-cleanup] DELETE card ${cardId} failed: ${response.status()} — skipping`,
		);
		return false;
	}
	return true;
}

/**
 * Limpia tarjetas excedentes de un pasajero.
 *
 * Lógica:
 *   1. Mantiene la tarjeta default siempre
 *   2. De cada last4 requerido, conserva solo las 2 más recientes (id más alto)
 *   3. Elimina TODO el resto hasta quedar con ≤ targetCount tarjetas
 *   4. Si aún excede, elimina las más antiguas de las preservadas
 *
 * Evidencia: Marcelle Stripe tenía 47 tarjetas (36 con last4=4242) y el backend
 * rechazaba con limitExceeded=false incluso seleccionando tarjeta guardada.
 *
 * @returns Cantidad de tarjetas eliminadas
 */
export async function cleanupExcessCards(
	page: Page,
	passengerId: number,
	cards: PassengerCard[],
	opts: {
		maxCards?: number;
		preserveLast4?: string[];
		/** Cuántas copias de cada last4 preservado mantener (default: 2) */
		keepPerLast4?: number;
	} = {},
): Promise<number> {
	const maxCards = opts.maxCards ?? MAX_CARDS_THRESHOLD;
	if (cards.length <= maxCards) return 0;

	const preserveSet = new Set(opts.preserveLast4 ?? []);
	const keepPerLast4 = opts.keepPerLast4 ?? 2;
	const targetCount = Math.floor(maxCards / 2); // Objetivo: 10 tarjetas

	// Paso 1: Separar tarjetas por categoría
	const defaultCards: PassengerCard[] = [];
	const preservedByLast4 = new Map<string, PassengerCard[]>();
	const others: PassengerCard[] = [];

	for (const card of cards) {
		if (card.defaultCard) {
			defaultCards.push(card);
		} else if (preserveSet.has(card.lastFourDigits)) {
			const group = preservedByLast4.get(card.lastFourDigits) ?? [];
			group.push(card);
			preservedByLast4.set(card.lastFourDigits, group);
		} else {
			others.push(card);
		}
	}

	// Paso 2: De cada last4 preservado, quedarse solo con las keepPerLast4 más recientes
	const keepList: PassengerCard[] = [...defaultCards];
	const deleteList: PassengerCard[] = [...others]; // Todas las "others" se eliminan

	for (const [last4, group] of preservedByLast4) {
		// Ordenar por id descendente (más recientes primero)
		group.sort((a, b) => b.id - a.id);
		const keep = group.slice(0, keepPerLast4);
		const discard = group.slice(keepPerLast4);
		keepList.push(...keep);
		deleteList.push(...discard);
		if (discard.length > 0) {
			console.log(
				`[card-cleanup] last4=${last4}: ${group.length} tarjetas → conservando ${keep.length} más recientes, eliminando ${discard.length}`,
			);
		}
	}

	// Paso 3: Si keepList aún excede targetCount, recortar las más antiguas
	if (keepList.length > targetCount) {
		keepList.sort((a, b) => b.id - a.id); // Más recientes primero
		const excess = keepList.splice(targetCount);
		deleteList.push(...excess);
	}

	// Ordenar deleteList por id ascendente (eliminar las más antiguas primero)
	deleteList.sort((a, b) => a.id - b.id);

	console.log(
		`[card-cleanup] Pasajero ${passengerId}: ${cards.length} tarjetas → eliminando ${deleteList.length}, conservando ${keepList.length}`,
	);

	let deleted = 0;
	for (const card of deleteList) {
		const ok = await deletePassengerCard(page, passengerId, card.id);
		if (ok) deleted++;
	}

	console.log(`[card-cleanup] Resultado: ${deleted}/${deleteList.length} eliminadas`);
	return deleted;
}

/** Resultado de la validación de precondición */
export interface CardPreconditionResult {
	passengerId: number;
	totalCards: number;
	activeCards: number;
	hasRequiredCard: boolean;
	/** Tarjetas que matchean el last4 requerido */
	matchingCards: PassengerCard[];
	/** true si el pasajero tiene CREDIT_CARD como método de pago habilitado */
	creditCardEnabled: boolean;
	/** Cantidad de tarjetas eliminadas en cleanup (0 si no se ejecutó) */
	cardsDeleted: number;
}

/**
 * Valida la precondición completa de tarjeta para un pasajero.
 *
 * Si el pasajero tiene más de 20 tarjetas, elimina automáticamente las
 * excedentes (las más antiguas) preservando las que tienen el last4 requerido
 * y la tarjeta default. Esto previene el error limitExceeded=false causado
 * por exceso de payment methods en Stripe.
 *
 * Endpoint de cleanup: DELETE /magiis-v0.2/users/{passengerId}/cards/{cardId}
 *
 * Uso en beforeAll/beforeEach:
 * ```ts
 * const result = await validateCardPrecondition(page, {
 *   passengerName: 'marce',
 *   requiredLast4: '4242',
 * });
 * // result.cardsDeleted > 0 si se limpiaron excedentes
 * ```
 */
export async function validateCardPrecondition(
	page: Page,
	opts: {
		passengerName: string;
		requiredLast4: string;
		carrierId?: string;
		/** Si true (default), limpia tarjetas excedentes automáticamente */
		autoCleanup?: boolean;
	},
): Promise<CardPreconditionResult> {
	const carrierId = opts.carrierId ?? DEFAULT_CARRIER_ID;
	const autoCleanup = opts.autoCleanup ?? true;

	let passengerId: number;
	try {
		passengerId = await getPassengerId(page, opts.passengerName, carrierId);
	} catch (err) {
		// Pasajero no encontrado vía API (puede ser colaborador contractor que no
		// aparece en el listado carrier directo). Devolver resultado neutro para
		// que el test continúe sin preferSavedCard — vinculará nueva tarjeta.
		console.warn(
			`[card-precondition] No se pudo obtener passengerId para "${opts.passengerName}" — continuando sin precondición API. Error: ${(err as Error).message}`,
		);
		return {
			passengerId: -1,
			totalCards: 0,
			activeCards: 0,
			hasRequiredCard: false,
			matchingCards: [],
			creditCardEnabled: false,
			cardsDeleted: 0,
		};
	}

	let paymentData = await getPassengerCards(page, passengerId, carrierId);
	let cards = paymentData.cards ?? [];

	// Cleanup automático si excede el umbral
	let cardsDeleted = 0;
	if (autoCleanup && cards.length > MAX_CARDS_THRESHOLD) {
		console.log(
			`[card-precondition] ⚠ ${opts.passengerName} tiene ${cards.length} tarjetas (umbral: ${MAX_CARDS_THRESHOLD}) — ejecutando cleanup`,
		);
		cardsDeleted = await cleanupExcessCards(page, passengerId, cards, {
			preserveLast4: [opts.requiredLast4],
		});

		// Re-fetch tarjetas post-cleanup para tener el estado actualizado
		if (cardsDeleted > 0) {
			paymentData = await getPassengerCards(page, passengerId, carrierId);
			cards = paymentData.cards ?? [];
			console.log(
				`[card-precondition] Post-cleanup: ${cards.length} tarjetas restantes`,
			);
		}
	}

	const matchingCards = cards.filter(
		(c) => c.lastFourDigits === opts.requiredLast4 && !c.expired,
	);

	return {
		passengerId,
		totalCards: cards.length,
		activeCards: countActiveCards(cards),
		hasRequiredCard: matchingCards.length > 0,
		matchingCards,
		creditCardEnabled: (paymentData.paymentMethods ?? []).includes('CREDIT_CARD'),
		cardsDeleted,
	};
}
