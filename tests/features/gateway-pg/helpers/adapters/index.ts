import type { PaymentGateway } from '../../contracts/gateway-pg.types';
import { SUPPORTED_INTENTS_BY_GATEWAY } from '../../../../fixtures/gateways/_shared';
import { journeyDefaultsFor } from '../../data/journey-defaults';
import { XRAY_KEYS_BY_GATEWAY } from '../../data/xray-keys';
import { authorizeGatewayAdapter } from './authorizeGatewayAdapter';
import { ebizchargeGatewayAdapter } from './ebizchargeGatewayAdapter';
import { mercadoPagoGatewayAdapter } from './mercadoPagoGatewayAdapter';
import { stripeGatewayAdapter } from './stripeGatewayAdapter';
import type { GatewayPgAdapter } from './types';
import { missingEnvKeys } from './types';

const gatewayAdapterMap: Record<PaymentGateway, GatewayPgAdapter> = {
	'mercado-pago': mercadoPagoGatewayAdapter,
	stripe: stripeGatewayAdapter,
	ebizcharge: ebizchargeGatewayAdapter,
	authorize: authorizeGatewayAdapter
};

export function getGatewayPgAdapter(gateway: PaymentGateway): GatewayPgAdapter {
	return gatewayAdapterMap[gateway];
}

export function listGatewayPgAdapters(): GatewayPgAdapter[] {
	return Object.values(gatewayAdapterMap);
}

/**
 * Pasarelas ACTIVAS para los specs parametrizados (S7):
 *   1. Pin explícito por env `GATEWAYS` (CSV, ej. `GATEWAYS=stripe,authorize`) — gana
 *      siempre; un nombre inválido LANZA en tiempo de colección (error de invocación,
 *      no un skip silencioso).
 *   2. Default: las pasarelas cuyo adapter está configurado (`isConfigured()` — creds
 *      presentes en env; stripe no exige creds propias → siempre activa).
 *
 * Se evalúa en tiempo de COLECCIÓN (module load de los specs parametrizados): el set de
 * tests generados depende del env — pinnear `GATEWAYS` en CI para runs deterministas.
 */
export function resolveActiveGateways(): PaymentGateway[] {
	const validNames = Object.keys(gatewayAdapterMap) as PaymentGateway[];
	const pinned = (process.env.GATEWAYS ?? '')
		.split(',')
		.map(name => name.trim().toLowerCase())
		.filter(Boolean);

	if (pinned.length > 0) {
		const invalid = pinned.filter(name => !validNames.includes(name as PaymentGateway));
		if (invalid.length > 0) {
			throw new Error(
				`GATEWAYS contiene pasarelas desconocidas: [${invalid.join(', ')}] — válidas: ${validNames.join(', ')}.`
			);
		}
		// Post-review A4: pin explícito de una pasarela con creds propias NO configuradas →
		// aviso accionable (el pin manda, NO throw). Riesgo cross-tenant: sin sus creds la
		// cadena de login (USER_CARRIER_<GW>_<ENV> → … → USER_CARRIER) cae al carrier
		// DEFAULT equivocado y el run "de esa pasarela" opera sobre otro tenant.
		for (const name of pinned as PaymentGateway[]) {
			const adapter = gatewayAdapterMap[name];
			if (adapter.credsEnvKeys.length > 0 && !adapter.isConfigured()) {
				const missing = missingEnvKeys(adapter.credsEnvKeys);
				console.warn(
					`⚠️  GATEWAYS pinnea '${name}' pero faltan sus creds propias: [${missing.join(', ')}] ` +
						`(o su variante _<ENV>). Riesgo: el login caerá al carrier DEFAULT equivocado ` +
						`(cross-tenant). Configurarlas en el .env del ambiente activo antes de correr.`
				);
			}
		}
		return pinned as PaymentGateway[];
	}

	return listGatewayPgAdapters()
		.filter(adapter => adapter.isConfigured())
		.map(adapter => adapter.gateway);
}

// ═══════════════════════════════════════════════════════════════════════
// BL-024 Fase 4 — Bridge declarativo ↔ fixtures
// ═══════════════════════════════════════════════════════════════════════

/**
 * Re-export del resolver polimórfico cross-gateway desde `fixtures/gateways/_shared`.
 *
 * Permite consumir desde un solo punto:
 *   - el adapter declarativo (metadata estática del gateway)
 *   - el resolver de tarjetas (factory por intención)
 *
 * Uso:
 *   import { getGatewayPgAdapter, resolveCard } from 'helpers/adapters';
 *
 *   const adapter = getGatewayPgAdapter('stripe');
 *   if (adapter.requires3ds) {
 *     const card = resolveCard({ gateway: 'stripe', intent: 'HAPPY_AUTH' });
 *     // ... usar card.number, card.cvc, card.zip
 *   }
 */
export {
	resolveCard,
	SUPPORTED_INTENTS_BY_GATEWAY,
	type CardIntent,
	type GatewayName,
	type GenericTestCard,
	type ResolveCardArgs
} from '../../../../fixtures/gateways/_shared';

/**
 * Validación in-process de consistencia adapter ↔ resolver ↔ registry Xray.
 *
 * S2 (carrier/gateway-standardization) — extendida de la versión BL-024 (que solo
 * chequeaba `requires3ds` de stripe/authorize) a las 4 pasarelas y a la config
 * operacional nueva:
 *
 *   1. `requires3ds` ⇔ el resolver soporta `HAPPY_AUTH` (3DS es EXCLUSIVO Stripe;
 *      para el resto los casos 3DS NO se generan — ni siquiera como skipped).
 *   2. Todo gateway soporta `HAPPY_NO_AUTH` (intent mínimo de cualquier suite).
 *   3. `nativeExtraField` solo tiene sentido con `cardForm: 'native-angular'`.
 *   4. `cardForm: 'stripe-elements'` ⇒ `outcomeTrigger: 'number'` (Elements no
 *      expone trigger por CVV/ZIP ni por holder).
 *   5. `linkSuccessStatuses` no vacío (el matcher de éxito del link lo consume S4).
 *   6. `xrayKeys` apunta EXACTAMENTE a la entrada del registry de su gateway
 *      (identidad referencial — evita copias divergentes del registry).
 *
 * Si los datos divergen, lanza error en runtime. SÍ se ejecuta automáticamente:
 * `specs/_parametrized/adapters-consistency.unit.spec.ts` lo invoca en el project
 * `unit` (`npm run test:test:gateway:unit`), así el drift falla en CI.
 *
 * Devuelve `true` si todo consistente, lanza si hay drift.
 */
export function assertAdapterFixtureConsistency(): true {
	for (const adapter of Object.values(gatewayAdapterMap)) {
		const gateway = adapter.gateway;
		const intents = SUPPORTED_INTENTS_BY_GATEWAY[gateway];

		// 1. requires3ds ⇔ resolver soporta HAPPY_AUTH.
		const resolverSupports3ds = intents.includes('HAPPY_AUTH');
		if (adapter.requires3ds !== resolverSupports3ds) {
			throw new Error(
				`[adapter-fixture-drift] ${gateway}.requires3ds = ${adapter.requires3ds} pero el resolver ${resolverSupports3ds ? 'soporta' : 'NO soporta'} HAPPY_AUTH.`
			);
		}

		// 2. Intent mínimo HAPPY_NO_AUTH.
		if (!intents.includes('HAPPY_NO_AUTH')) {
			throw new Error(
				`[adapter-fixture-drift] el resolver de ${gateway} no soporta HAPPY_NO_AUTH (intent mínimo).`
			);
		}

		// 3. nativeExtraField solo aplica al form nativo Angular.
		if (adapter.nativeExtraField && adapter.cardForm !== 'native-angular') {
			throw new Error(
				`[adapter-fixture-drift] ${gateway}.nativeExtraField='${adapter.nativeExtraField}' pero cardForm='${adapter.cardForm}' (solo aplica a 'native-angular').`
			);
		}

		// 4. Stripe Elements dispara outcome por número.
		if (adapter.cardForm === 'stripe-elements' && adapter.outcomeTrigger !== 'number') {
			throw new Error(
				`[adapter-fixture-drift] ${gateway}: cardForm 'stripe-elements' exige outcomeTrigger 'number' (actual: '${adapter.outcomeTrigger}').`
			);
		}

		// 5. Statuses de éxito del link declarados.
		if (adapter.linkSuccessStatuses.length === 0) {
			throw new Error(`[adapter-fixture-drift] ${gateway}.linkSuccessStatuses está vacío.`);
		}

		// 6. Registry Xray por identidad referencial (sin copias divergentes).
		if (adapter.xrayKeys !== XRAY_KEYS_BY_GATEWAY[gateway]) {
			throw new Error(
				`[adapter-fixture-drift] ${gateway}.xrayKeys NO referencia XRAY_KEYS_BY_GATEWAY['${gateway}'] (data/xray-keys.ts es la única fuente).`
			);
		}

		// 7. Journey defaults por identidad referencial (S8 — sin copias divergentes).
		if (adapter.journeyDefaults !== journeyDefaultsFor(gateway)) {
			throw new Error(
				`[adapter-fixture-drift] ${gateway}.journeyDefaults NO referencia JOURNEY_DEFAULTS_BY_GATEWAY['${gateway}'] (data/journey-defaults.ts es la única fuente).`
			);
		}
	}

	return true;
}
