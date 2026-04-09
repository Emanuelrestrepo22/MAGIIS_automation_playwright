/**
 * Pasajeros de prueba por tipo de usuario en entorno TEST.
 * Actualizar nombres según los usuarios reales del entorno TEST.
 */

export interface TestPassenger {
  name: string;
  type: 'app-pax' | 'colaborador' | 'empresa-individuo';
  notes?: string;
}

export const PASSENGERS = {
  appPax: {
    name: 'Emanuel Restrepo',
    type: 'app-pax',
    notes: 'Usuario app pax personal — disponible en TEST',
  },
  colaborador: {
    name: 'Nayla Smith',
    type: 'colaborador',
    notes: 'Colaborador de fast car en TEST',
  },
  empresaIndividuo: {
    name: 'Marcelle Stripe',
    type: 'empresa-individuo',
    notes: 'Cliente individuo/empresa disponible en TEST',
  },
} as const satisfies Record<string, TestPassenger>;
