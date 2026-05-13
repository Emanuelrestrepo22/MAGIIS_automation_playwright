/**
 * PASSENGERS — Source of Truth de pasajeros de dominio MAGIIS.
 *
 * BL-009 Fase 4 (2026-05-13) — este archivo pasó a ser el SoT canónico.
 * El archivo legacy `tests/features/gateway-pg/data/passengers.ts` ahora
 * re-exporta desde acá para preservar imports existentes hasta su
 * deprecación definitiva.
 *
 * Estructura de usuarios por portal:
 *
 * CARRIER portal:
 *   - appPax (Emanuel Restrepo): usuario App Pax personal — tarjeta 4242 activa OK
 *   - empresaIndividuo (Marcelle Stripe): cliente individuo/empresa — verificar estado tarjeta
 *
 * CONTRACTOR portal (cliente: fast car):
 *   - colaborador (Emanuel Smith): colaborador con tarjeta 4242 activa OK — USAR en tests
 *   - colaboradorSinTarjeta (Nayla Smith): colaborador SIN tarjeta — NO usar hasta vincular
 *
 * Formato de nombre en portal: los colaboradores aparecen en formato
 * "apellido, nombre" en el dropdown de búsqueda (ej: 'smith, Emanuel').
 *
 * Nota: `PASSENGERS` describe **a qué cliente/colaborador** seleccionar en el
 * dropdown del formulario de viaje. No tiene credenciales — para login usar
 * `DISPATCHER`, `CONTRACTOR_COLLABORATOR`, `DRIVER` o `PASSENGER_APP_USER`.
 */

export interface TestPassenger {
  name: string;
  type: 'app-pax' | 'colaborador' | 'empresa-individuo';
  /** Formato de búsqueda en el dropdown del formulario de nuevo viaje (si difiere del displayName) */
  searchName?: string;
  /** Query para buscar el passengerId via API: GET /passengers/carrier/{carrierId}?lastName={apiSearchQuery} */
  apiSearchQuery?: string;
  /** passengerId confirmado vía API paymentMethodsByPax (null = no verificado) */
  passengerId?: number;
  /** true = tarjeta 4242 activa en TEST; false = sin tarjeta o límite bloqueado */
  hasActiveCard: boolean;
  /** Cantidad de tarjetas vinculadas (API paymentMethodsByPax). null = no verificado */
  totalCards?: number;
  /** contractorEmployeeId via API /contractorEmployees/{id} — solo aplica a colaboradores. */
  contractorEmployeeId?: number;
  notes?: string;
}

export const PASSENGERS = {
  /** App Pax personal — tarjeta 4242 activa OK */
  appPax: {
    name: 'Emanuel Restrepo',
    type: 'app-pax',
    apiSearchQuery: 'restrepo',
    hasActiveCard: true,
    notes: 'Usuario app pax personal — tarjeta 4242 activa en TEST',
  },
  /** Colaborador fast car CON tarjeta 4242 OK — usar en tests hold colaborador */
  colaborador: {
    name: 'smith, Emanuel',
    searchName: 'smith, Emanuel',
    type: 'colaborador',
    apiSearchQuery: 'smith',
    hasActiveCard: true,
    contractorEmployeeId: 1881,
    notes: 'Colaborador de fast car en TEST — tarjeta 4242 activa. Evidencia: test-7.spec.ts login contractor → buscar "ema" → "smith, Emanuel". contractorEmployeeId=1881 (endpoint DELETE /contractorEmployees/1881/serviceType/:sid/delete para reset uso).',
  },
  /** Colaborador fast car SIN tarjeta — NO usar en tests hold hasta vincular tarjeta en admin */
  colaboradorSinTarjeta: {
    name: 'Nayla Smith',
    type: 'colaborador',
    apiSearchQuery: 'nayla',
    hasActiveCard: false,
    notes: 'Colaborador de fast car en TEST — SIN tarjeta activa. Causa de limitExceeded=false en hold tests. Requiere Admin para vincular tarjeta.',
  },
  /** Cliente individuo/empresa — 42 tarjetas vinculadas en TEST (API confirmado 2026-04-16) */
  empresaIndividuo: {
    name: 'Marcelle Stripe',
    type: 'empresa-individuo',
    apiSearchQuery: 'marce',
    passengerId: 4951,
    hasActiveCard: true,
    totalCards: 42,
    notes: 'Cliente individuo/empresa en TEST — 42 tarjetas vinculadas (API paymentMethodsByPax). Incluye: 4242 (múltiples), 3155 (4), 9235 (4), 3184 (1), 3220 (1 default). Posible exceso de Stripe limit.',
  },
} as const satisfies Record<string, TestPassenger>;
