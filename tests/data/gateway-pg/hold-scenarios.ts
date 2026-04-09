/**
 * Datos de prueba para flujos de Hold / Preautorización Stripe.
 * Cada entrada mapea 1:1 con un TC fuente de la matriz.
 */
import { STRIPE_TEST_CARDS } from '../stripe-cards';

export interface HoldScenario {
  tcId: string;
  holdOn: boolean;
  card: keyof typeof STRIPE_TEST_CARDS;
  userType: 'app-pax' | 'colaborador' | 'empresa-individuo';
  has3DS: boolean;
}

export const HOLD_SCENARIOS = {
  // Carrier · App Pax · Hold con 3DS
  appPax_holdOn_3DS:      { tcId: 'TC1053', holdOn: true,  card: 'visa_3ds_success', userType: 'app-pax',           has3DS: true  },
  appPax_holdOff_3DS:     { tcId: 'TC1054', holdOn: false, card: 'visa_3ds_success', userType: 'app-pax',           has3DS: true  },

  // Carrier · App Pax · Hold sin 3DS
  appPax_holdOn_no3DS:    { tcId: 'TC1049', holdOn: true,  card: 'visa_success',     userType: 'app-pax',           has3DS: false },
  appPax_holdOff_no3DS:   { tcId: 'TC1050', holdOn: false, card: 'visa_success',     userType: 'app-pax',           has3DS: false },

  // Carrier · Colaborador · Hold con 3DS
  colab_holdOn_3DS:       { tcId: 'TC1037', holdOn: true,  card: 'visa_3ds_success', userType: 'colaborador',       has3DS: true  },
  colab_holdOff_3DS:      { tcId: 'TC1038', holdOn: false, card: 'visa_3ds_success', userType: 'colaborador',       has3DS: true  },

  // Carrier · Colaborador · Hold sin 3DS
  colab_holdOn_no3DS:     { tcId: 'TC1033', holdOn: true,  card: 'visa_success',     userType: 'colaborador',       has3DS: false },
  colab_holdOff_no3DS:    { tcId: 'TC1034', holdOn: false, card: 'visa_success',     userType: 'colaborador',       has3DS: false },

  // Carrier · Empresa Individuo · Hold con 3DS
  empresa_holdOn_3DS:     { tcId: 'TC1069', holdOn: true,  card: 'visa_3ds_success', userType: 'empresa-individuo', has3DS: true  },
  empresa_holdOff_3DS:    { tcId: 'TC1070', holdOn: false, card: 'visa_3ds_success', userType: 'empresa-individuo', has3DS: true  },

  // Carrier · Empresa Individuo · Hold sin 3DS
  empresa_holdOn_no3DS:   { tcId: 'TC1065', holdOn: true,  card: 'visa_success',     userType: 'empresa-individuo', has3DS: false },
  empresa_holdOff_no3DS:  { tcId: 'TC1066', holdOn: false, card: 'visa_success',     userType: 'empresa-individuo', has3DS: false },
} as const satisfies Record<string, HoldScenario>;
