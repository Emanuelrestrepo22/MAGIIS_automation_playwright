/**
 * Pasajeros de prueba por tipo de usuario en entorno TEST.
 *
 * Estructura de usuarios por portal:
 *
 * CARRIER portal:
 *   - appPax (Emanuel Restrepo): usuario App Pax personal — tarjeta 4242 activa ✅
 *   - empresaIndividuo (Marcelle Stripe): cliente individuo/empresa — estado tarjeta ⚠️ verificar
 *
 * CONTRACTOR portal (cliente: fast car):
 *   - colaboradorConTarjeta (Emanuel Smith): colaborador con tarjeta 4242 activa ✅ — USAR en tests
 *   - colaboradorSinTarjeta (Nayla Smith): colaborador sin tarjeta activa ❌ — NO usar hasta vincular tarjeta en admin
 *
 * Formato de nombre en portal: los colaboradores aparecen en formato "apellido, nombre"
 * en el dropdown de búsqueda (ej: 'smith, Emanuel').
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
  notes?: string;
}

export const PASSENGERS = {
  /** App Pax personal — tarjeta 4242 activa ✅ */
  appPax: {
    name: 'Emanuel Restrepo',
    type: 'app-pax',
    apiSearchQuery: 'restrepo',
    hasActiveCard: true,
    notes: 'Usuario app pax personal — tarjeta 4242 activa en TEST',
  },
  /** Colaborador fast car CON tarjeta 4242 ✅ — usar en tests hold colaborador */
  colaborador: {
    name: 'smith, Emanuel',
    searchName: 'smith, Emanuel',
    type: 'colaborador',
    apiSearchQuery: 'smith',
    hasActiveCard: true,
    notes: 'Colaborador de fast car en TEST — tarjeta 4242 activa. Evidencia: test-7.spec.ts login contractor → buscar "ema" → "smith, Emanuel"',
  },
  /** Colaborador fast car SIN tarjeta ❌ — NO usar en tests hold hasta vincular tarjeta en admin */
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
