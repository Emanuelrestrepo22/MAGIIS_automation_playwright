/**
 * Feature: Matriz de outcomes de tarjeta — Authorize.net (área C del ATP)
 * Tags: @gateway @authorize @cardmatrix @regression
 *
 * CONSUMIDOR THIN de `defineCardOutcomeMatrixSuite` — misma suite que eBizCharge, con los
 * datos de Authorize. Es la prueba de que la estandarización funciona: este archivo y el de
 * eBizCharge son idénticos salvo el nombre de la pasarela.
 *
 * En Authorize el outcome lo dispara la combinación (CVV, ZIP), no el número, y la matriz
 * ya lo modela: el spec no sabe nada de eso.
 *
 * Trazabilidad: sin TC de matriz mapeados para estos intents todavía → títulos sin
 * corchete. Los TC IDs de Authorize existen (`TS-AUTHORIZE-TC*`, 164 en su L1); mapear los
 * outcome-level es trabajo de la misma familia que ya se hizo para eBizCharge en
 * `data/card-matrix-tc-ids.ts`.
 *
 * ⚠️ Doble gate: `AUTHORIZE_*` en `.env.test` + `GATEWAY_ALLOW_DESTRUCTIVE_SWITCH=true`.
 */
import { defineCardOutcomeMatrixSuite } from '@features/gateway-pg/specs/_parametrized/factories/card-outcome-matrix.factory';
import { cardMatrixTcIdFor } from '@features/gateway-pg/data/card-matrix-tc-ids';

defineCardOutcomeMatrixSuite('authorize', { tcIdFor: cardMatrixTcIdFor });
