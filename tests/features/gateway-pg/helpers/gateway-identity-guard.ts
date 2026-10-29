/**
 * Guard de IDENTIDAD de pasarela — "la activa del carrier == la que la suite ejercita".
 * =====================================================================================
 *
 * El hueco que cubre: hasta hoy NADA verificaba que la pasarela vinculada al carrier fuera
 * la que la suite dice medir. `currentActiveGateway()` existe pero solo se usa como input
 * del switch, nunca como aserción. Consecuencia real (campaña Authorize, rondas 4-5): specs
 * de una pasarela midiendo contra otra sin que ningún test lo notara, y el form de tarjeta
 * es agnóstico — llena lo que le den contra la pasarela que esté activa.
 *
 * La fuente de verdad es la DB, no la UI: `MAGIIS.MGW_LINKED` con `provider` + `active=1` +
 * `delete_date IS NULL`. Verificado en vivo 2026-07-30 (fila 165: EBIZ activa tras el switch
 * manual del líder de QA; la 164 quedó AUTHORIZE con `STATUS='UNLINKED'`).
 *
 * Mapeo GatewayName → literal de la columna `provider` (el mismo que usa el path param de
 * `cleaningWallets` — `VendorProvider` en `VendorApi.ts`).
 *
 * ══ POLÍTICA DE FALLO (aprendida del guard de cuenta Authorize, hallazgo 6) ══
 * Un gate de validez de medición debe fallar CERRADO cuando puede medir y el resultado es
 * malo, pero NO debe convertir "no puedo medir" en bloqueo universal: sin config de Oracle
 * este guard AVISA y deja pasar, porque hay entornos legítimos sin acceso a DB (CI de
 * colección, dev local sin túnel). La diferencia con el fail-open del hallazgo 6: acá el
 * "no puedo medir" es una CONFIGURACIÓN ausente y explícita (las env vars no están), no un
 * veredicto indeterminado de un probe que debería haber contestado.
 */

import type { GatewayName } from '@fixtures/gateways/_shared';
import type { OracleReadConfig } from '@db/OracleDb';

import { oracleConfigFromEnv } from '@db/OracleDb';
import { readMgwLinkStatus } from '@features/gateway-pg/helpers/oracle-wallet';

/** GatewayName → literal de `MGW_LINKED.provider` (== `VendorProvider` de la capa API). */
export const MGW_PROVIDER_BY_GATEWAY = {
	stripe: 'STRIPE',
	authorize: 'AUTHORIZE',
	ebizcharge: 'EBIZ',
	'mercado-pago': 'MERCADOPAGO'
} as const satisfies Record<GatewayName, string>;

const DEFAULT_CARRIER_ID = Number(process.env.CARRIER_ID ?? '1521');

/**
 * Asserta contra la DB que `gateway` es la pasarela ACTIVA del carrier.
 *
 * @throws Si la DB es consultable y el provider NO está activo (fila ausente, `active=0` o
 *   `delete_date` seteado). El mensaje dice qué hacer, no solo qué falló.
 * @returns `'verified'` si la DB confirmó; `'db-unavailable'` si no hay config de Oracle
 *   (avisa por consola y NO bloquea — ver política de fallo en el doc del módulo).
 */
export async function assertActiveGatewayInDb(
	gateway: GatewayName,
	options: { carrierAccountId?: number; config?: OracleReadConfig | null } = {}
): Promise<'verified' | 'db-unavailable'> {
	const cfg = options.config !== undefined ? options.config : oracleConfigFromEnv();
	if (!cfg) {
		console.warn(
			`[gateway-identity-guard] Sin config de Oracle (ORACLE_*_TEST): no se puede verificar por DB que ` +
				`'${gateway}' sea la pasarela activa. La suite sigue, pero la identidad de pasarela queda SIN acreditar.`
		);
		return 'db-unavailable';
	}

	const carrierAccountId = options.carrierAccountId ?? DEFAULT_CARRIER_ID;
	const provider = MGW_PROVIDER_BY_GATEWAY[gateway];

	let rows;
	try {
		rows = await readMgwLinkStatus(cfg, { carrierAccountId, provider });
	} catch (error) {
		// DB configurada pero INALCANZABLE (NJS-5xx timeout/red, ORA- de conectividad): es el mismo
		// "no puedo medir por entorno" que la política del módulo resuelve con avisar-y-seguir —
		// hasta hoy solo estaba implementado para config AUSENTE y el timeout reventaba la suite
		// entera (observado 2026-07-31: NJS-510 contra el RDS de test, alcanzable el día anterior).
		// NO es el fail-open del hallazgo 6: esto no acredita nada — devuelve 'db-unavailable' y el
		// run queda registrado con la identidad SIN acreditar (el probe UI del App Store es la
		// evidencia compensatoria). Un veredicto SÍ obtenido y malo sigue fallando cerrado (abajo).
		const msg = error instanceof Error ? error.message : String(error);
		console.warn(
			`[gateway-identity-guard] Oracle configurada pero INALCANZABLE (${msg.split('\n')[0]}): no se puede ` +
				`verificar por DB que '${gateway}' sea la pasarela activa del carrier ${carrierAccountId}. La suite ` +
				'sigue con la identidad SIN acreditar por DB — restaurar el acceso (allowlist/VPN/instancia) antes ' +
				'de la corrida formal.'
		);
		return 'db-unavailable';
	}
	const activa = rows.find(row => Number(row.active) === 1 && !row.deleteDate);

	if (!activa) {
		const ultimo = rows[0];
		throw new Error(
			`[gateway-identity-guard] La suite ejercita '${gateway}' pero MGW_LINKED NO tiene a '${provider}' ` +
				`activo para el carrier ${carrierAccountId}` +
				(ultimo
					? ` (última fila: id=${ultimo.id}, active=${ultimo.active}, deleteDate=${ultimo.deleteDate ?? 'null'})`
					: ' (sin filas)') +
				'. Medir así produciría resultados de OTRA pasarela: vincular la correcta desde el App Store ' +
				'(o con GatewaySwitchSteps.ensureActiveGateway) y re-correr.'
		);
	}

	return 'verified';
}
