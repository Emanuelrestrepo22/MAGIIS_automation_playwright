/**
 * Feature: Matriz de outcomes de tarjeta — eBizCharge (área C del ATP)
 * Tags: @gateway @ebizcharge @cardmatrix @regression
 *
 * CONSUMIDOR THIN de `defineCardOutcomeMatrixSuite`. Un caso por intent canónico: se
 * ingresa la tarjeta que dispara ese outcome en el sandbox de eBizCharge y se verifica lo
 * que el sistema debe hacer.
 *
 * eBizCharge es la pasarela que más aprovecha esta suite: su doc publica 14 códigos de
 * decline, antifraude, referral y latencia, y hasta ahora solo 3 de sus 92 números eran
 * alcanzables desde un spec.
 *
 * Trazabilidad: los TC de matriz salen de `data/card-matrix-tc-ids.ts` (rango
 * outcome-level TS-EBIZ-TC1001-1041). Las keys MG de Xray todavía no existen → los casos
 * corren sin annotation `tms` y salen `unmapped`, que es el comportamiento correcto
 * mientras QA no cree las issues (ver `docs/gateway-pg/ebizcharge/MG-KEYS-REQUEST.md`).
 *
 * ⚠️ Doble gate: `EBIZ_MERCHANT_*` en `.env.test` + `GATEWAY_ALLOW_DESTRUCTIVE_SWITCH=true`.
 * Sin ellos la suite entera skipea limpio, y el spec compila y se colecciona igual.
 */
import { defineCardOutcomeMatrixSuite } from '@features/gateway-pg/specs/_parametrized/factories/card-outcome-matrix.factory';
import { cardMatrixTcIdFor } from '@features/gateway-pg/data/card-matrix-tc-ids';

defineCardOutcomeMatrixSuite('ebizcharge', { tcIdFor: cardMatrixTcIdFor });
