// MP-NOHOLD-04 · portal Contractor, colaborador de empresa — alta de viaje SIN hold (ARG, TEST)
// Convertido del recording test-15.spec.ts (2026-07-22). Alcance TEST aprobado por negocio:
// llega a creación del viaje (redirect fuera del formulario de alta); el cobro desde el driver
// NO se valida aquí (no completa en TEST — gap conocido → UAT con tarjetas reales).
//
// MIGRADO a `ContractorHoldSteps.runColaboradorScenario` (S7, carrier/gateway-standardization) —
// el Step contractor es el par de `runHoldScenario` para este portal (campo único de usuario,
// redirect a dashboard en vez de grilla de gestión). Misma cobertura + mejoras del Step:
//   - Login contractor con creds chain MP.
//   - Tarjeta APRO vía resolver cross-gateway + form nativo Angular + skip si la validación
//     no completa en TEST (sandbox MP no transacciona — UAT-only).
//   - threeDs 'none': se asevera la AUSENCIA del modal 3DS (MP no lo soporta).
//   - El Step además captura el travelId (aserción de creación en backend) y cancela el viaje
//     creado como cleanup (el spec original lo dejaba huérfano).
// Precondición hold OFF: se controla desde el portal Carrier — este flujo no lo toggla.
//
// ⚠️ DRAFT: locators FRAGILE del form MP (NativeAngularCardForm) pendientes de corrida viva.
import { test } from '@TestFixture';
import { ContractorHoldSteps } from '@steps/index';

const env = process.env.ENV ?? 'test';

// Datos TEST (colaborador de empresa): "Emanuel Restrepo" (token de búsqueda "ema", como el recorder)
const MP_COLABORADOR = 'Emanuel Restrepo';
const MP_ORIGIN = 'Ciudad de la Paz 2238, Ciudad Autónoma de Buenos Aires, Argentina';
const MP_DESTINATION = 'Reconquista 661, Ciudad Autónoma de Buenos Aires';

test.describe(`[SMOKE][MP][${env.toUpperCase()}] Alta sin hold · Contractor colaborador`, () => {
	test.describe.configure({ mode: 'serial' });
	test.describe.configure({ timeout: 180_000 });
	// El fixture KATA (@TestFixture) no define la opción `role` — login explícito en el Step.
	test.use({ storageState: { cookies: [], origins: [] } });

	test('@smoke @gateway @gateway-pg @mercadopago @contractor @no-hold @happy [MP-NOHOLD-04] Colaborador empresa · alta sin hold con tarjeta APRO → redirect dashboard', async ({
		page
	}) => {
		await new ContractorHoldSteps({ page }).runColaboradorScenario({
			gateway: 'mercado-pago',
			user: MP_COLABORADOR,
			origin: MP_ORIGIN,
			destination: MP_DESTINATION,
			card: { kind: 'new' }, // tarjeta resuelta por el Step vía resolveCard (holder APRO)
			threeDs: 'none'
		});
	});
});
