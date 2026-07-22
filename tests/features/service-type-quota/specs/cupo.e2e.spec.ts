/**
 * TS-MX6057-E2E-CUPO — E2E del cupo (cantidad limitada de usos) de un service type asociado a
 * un colaborador de contractor. Capa UI del ticket MX-6057.
 *
 * Blueprint de ALTA FIDELIDAD: selectores + datos derivados del recording `tests/test-1.spec.ts`
 * y de la exploración en vivo (UAT carrier 1040). Textos BILINGÜES (EN|ES, ver ../pages/i18n) —
 * el spec NO fija idioma; corre en el locale que tenga activo el toggle de la cuenta.
 * Sigue en `test.fixme` hasta validar en vivo la tabla Associates + confirmar los strings ES
 * marcados TODO(i18n).
 *
 * Trazabilidad:  Bug MX-6057 · ATP MX-6115 · ATR MX-6122
 *   API (capa contrato): ../../gateway-pg/api/service-type-counts-reset/counts-reset.api.spec.ts
 *
 * Datos (UAT carrier 1040): ST = "v1.72.6" (id 467, cupo Diaria/Cantidad 2). Contractor =
 * "dark empire v1.72.6". Colaboradores: A = "Anakin skywaker", B = "Arturitu skiwalker".
 */
import { test, expect } from '../../../TestBase';
import { NewTravelPage } from '../../../pages/carrier';
import { ServiceTypeQuotaConfigPage } from '../pages/ServiceTypeQuotaConfigPage';
import { CorporationsManagementPage } from '../pages/CorporationsManagementPage';
import { L } from '../pages/i18n';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

const SERVICE_TYPE = 'v1.72.6';
const CONTRACTOR = 'dark empire v1.72.6'; // renombrado para ser único/distinguible en el listado
const COLAB_A = 'anakin'; // skywaker, Anakin (consume/agota)
const COLAB_B = 'arturi'; // skiwalker, Arturitu (trazabilidad)
const ORIGIN = 'Reconquista 661';
const DESTINATION = 'Ciudad de la Paz 2238';
const QUOTA = 2;

test.describe('TS-MX6057-E2E-CUPO @regression @service-type-quota @carrier', () => {
	test.fixme(true, 'Blueprint alta fidelidad — validar en vivo tabla Associates + strings ES (TODO(i18n))');

	test('[TS-MX6057-E2E-CUPO] cupo de service type: consumo, bloqueo, reset por colaborador y global', async ({ page, loginPage }) => {
		const config = new ServiceTypeQuotaConfigPage(page);
		const travel = new NewTravelPage(page);
		const corp = new CorporationsManagementPage(page);

		await test.step('1. Login carrier + configurar cupo del service type (Diaria, Cantidad 2)', async () => {
			await loginPage.goto();
			// TODO(codegen): login carrier UAT (role 'carrier' ya seleccionado por TestBase).
			await config.goto();
			await config.openServiceTypeEditor(SERVICE_TYPE);
			await config.setQuota('daily', QUOTA);
		});

		await test.step('2. Alta de viaje consumiendo cupo del colaborador A', async () => {
			await travel.goto();
			await travel.selectClient(COLAB_A);
			await travel.selectServiceType(SERVICE_TYPE);
			await travel.setOrigin(ORIGIN);
			await travel.setDestination(DESTINATION);
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('2b. Verificar contador de cupo del colaborador A en Gestión de Empresas', async () => {
			await corp.goto();
			await corp.search(CONTRACTOR);
			await corp.openFirstResultDetail();
			await corp.openAssociates();
			await corp.openAssociateUsagePanel();
			await corp.expectServiceTypeRow(SERVICE_TYPE); // TODO(codegen): assert conteo usado = 1/2
			await corp.closeUsageDialog();
		});

		await test.step('3. Agotar cupo → alta bloqueada con "Service Usage Limit Exceeded"', async () => {
			// Consumir hasta agotar (cupo=2): segundo viaje + tercero bloqueado.
			for (let i = 1; i < QUOTA; i++) {
				await travel.goto();
				await travel.selectClient(COLAB_A);
				await travel.selectServiceType(SERVICE_TYPE);
				await travel.setOrigin(ORIGIN);
				await travel.setDestination(DESTINATION);
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			}
			// Intento que excede el cupo → mensaje de bloqueo (tras "Select Vehicle").
			await travel.goto();
			await travel.selectClient(COLAB_A);
			await travel.selectServiceType(SERVICE_TYPE);
			await travel.setOrigin(ORIGIN);
			await travel.setDestination(DESTINATION);
			await travel.clickSelectVehicle();
			await expect(page.getByText(L.serviceUsageLimitExceeded)).toBeVisible();
		});

		await test.step('4. Trazabilidad: colaborador B (con cupo) puede dar de alta', async () => {
			await travel.goto();
			await travel.selectClient(COLAB_B);
			await travel.selectServiceType(SERVICE_TYPE);
			await travel.setOrigin(ORIGIN);
			await travel.setDestination(DESTINATION);
			await travel.clickSelectVehicle();
			await travel.clickSendService(); // B no comparte el cupo agotado de A
		});

		await test.step('5. Reset por colaborador (A) desde Gestión de Empresas', async () => {
			await corp.goto();
			await corp.search(CONTRACTOR);
			await corp.openFirstResultDetail();
			await corp.openAssociates();
			await corp.openAssociateUsagePanel();
			await corp.resetAssociateQuota(); // DELETE /contractorEmployees/{id}/serviceType/{sid}/delete
			await corp.closeUsageDialog();
		});

		await test.step('6. Colaborador A reseteado vuelve a poder dar de alta', async () => {
			await travel.goto();
			await travel.selectClient(COLAB_A);
			await travel.selectServiceType(SERVICE_TYPE);
			await travel.setOrigin(ORIGIN);
			await travel.setDestination(DESTINATION);
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('7. Reset global desde tipo de servicio (countsReset — MX-6057)', async () => {
			await config.goto();
			await config.resetQuotaForAllCollaborators(SERVICE_TYPE); // → modal "Confirm Reset"
		});

		await test.step('8. Verificación visual en Gestión de Empresas: cupo reseteado para todos', async () => {
			await corp.goto();
			await corp.search(CONTRACTOR);
			await corp.openFirstResultDetail();
			await corp.openAssociates();
			await corp.openAssociateUsagePanel();
			await corp.expectServiceTypeRow(SERVICE_TYPE); // TODO(codegen): assert conteo = 0 para todos
			await corp.closeUsageDialog();
		});

		await test.step('9. Alta de viaje final OK tras el reset global', async () => {
			await travel.goto();
			await travel.selectClient(COLAB_A);
			await travel.selectServiceType(SERVICE_TYPE);
			await travel.setOrigin(ORIGIN);
			await travel.setDestination(DESTINATION);
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});
	});
});
