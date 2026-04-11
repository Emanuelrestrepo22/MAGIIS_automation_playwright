/**
 * Datos de prueba para flujos de Cargo a Bordo (tarjeta de crédito directa).
 * Cada entrada mapea 1:1 con un TC fuente de la matriz.
 *
 * Nota: las claves de cardKey deben coincidir con tests/data/stripe-cards.ts.
 */

export interface CargoScenario {
  tcId: string;
  cardKey: string;
  expectedResult: 'approved' | 'approved-after-3ds' | 'declined' | 'antifraud' | '3ds-failed';
  userType: 'app-pax' | 'colaborador' | 'empresa-individuo';
}

export const CARGO_SCENARIOS = {
  // App Pax
  appPax_happy:             { tcId: 'TC1081', cardKey: 'visa_success',          expectedResult: 'approved',           userType: 'app-pax' },
  appPax_declined:          { tcId: 'TC1082', cardKey: 'declined_generic',       expectedResult: 'declined',           userType: 'app-pax' },
  appPax_insufficientFunds:  { tcId: 'TC1083', cardKey: 'declined_funds',         expectedResult: 'declined',           userType: 'app-pax' },
  appPax_lostCard:          { tcId: 'TC1084', cardKey: 'lost_card',               expectedResult: 'declined',           userType: 'app-pax' },
  appPax_cvcFail:           { tcId: 'TC1085', cardKey: 'incorrect_cvc',           expectedResult: 'declined',           userType: 'app-pax' },
  appPax_stolen:            { tcId: 'TC1086', cardKey: 'stolen_card',             expectedResult: 'declined',           userType: 'app-pax' },
  appPax_antifraud_cvc:     { tcId: 'TC1087', cardKey: 'cvc_check_fail',          expectedResult: 'antifraud',          userType: 'app-pax' },
  appPax_antifraud_risk:    { tcId: 'TC1088', cardKey: 'highest_risk',            expectedResult: 'antifraud',          userType: 'app-pax' },
  appPax_antifraud_blocked: { tcId: 'TC1089', cardKey: 'always_blocked',          expectedResult: 'antifraud',          userType: 'app-pax' },
  appPax_antifraud_zip:     { tcId: 'TC1090', cardKey: 'zip_fail_elevated',       expectedResult: 'antifraud',          userType: 'app-pax' },
  appPax_antifraud_addr:    { tcId: 'TC1091', cardKey: 'address_unavailable',     expectedResult: 'antifraud',          userType: 'app-pax' },
  appPax_3ds_success:       { tcId: 'TC1092', cardKey: 'visa_3ds_success',        expectedResult: 'approved-after-3ds', userType: 'app-pax' },
  appPax_3ds_fail:          { tcId: 'TC1093', cardKey: 'visa_3ds_fail',           expectedResult: '3ds-failed',         userType: 'app-pax' },

  // Colaborador
  colab_happy:              { tcId: 'TC1096', cardKey: 'visa_success',          expectedResult: 'approved',           userType: 'colaborador' },
  colab_3ds_success:        { tcId: 'TC1107', cardKey: 'visa_3ds_success',       expectedResult: 'approved-after-3ds', userType: 'colaborador' },

  // Empresa Individuo
  empresa_happy:            { tcId: 'TC1111', cardKey: 'visa_success',          expectedResult: 'approved',           userType: 'empresa-individuo' },
} as const satisfies Record<string, CargoScenario>;
