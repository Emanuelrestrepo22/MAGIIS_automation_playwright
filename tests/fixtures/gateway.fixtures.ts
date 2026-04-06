import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { getPortalCredentials, getPortalUrl } from '../config/gatewayPortalRuntime';
import { resolveLoginPath } from '../config/runtime';
import { STRIPE_CVC, STRIPE_EXPIRY, STRIPE_TEST_CARDS, TEST_DATA } from '../shared/gateway-pg/stripeTestData';
import { NewTravelPage, ThreeDSModal, ThreeDSErrorPopup, TravelDetailPage, TravelManagementPage } from '../pages/gateway-pg';

// Reexportamos estos datos para que las specs de gateway importen todo
// desde una sola entrada y no tengan que conocer la estructura interna del módulo.
export { STRIPE_CVC, STRIPE_EXPIRY, STRIPE_TEST_CARDS, TEST_DATA, getPortalUrl };

export async function loginAsDispatcher(page: Page): Promise<void> {
	// Login rápido del portal carrier para journeys disparados por dispatcher.
	const { user, pass } = getPortalCredentials('carrier');
	await page.goto(`${getPortalUrl('carrier')}${resolveLoginPath('carrier')}`);
	await page.locator('input[placeholder="Email"]').fill(user);
	await page.locator('input[placeholder="Contraseña"]').fill(pass);
	await page.locator('button[type="submit"]').click();
	await page.waitForURL('**dashboard**', { timeout: 15_000 });
}

export async function loginAsPax(page: Page): Promise<void> {
	// Login equivalente para el portal de pasajero cuando la prueba nace del wallet.
	const { user, pass } = getPortalCredentials('pax');
	await page.goto(`${getPortalUrl('pax')}/login`);
	await page.getByLabel('Email').fill(user);
	await page.getByLabel('Contraseña').fill(pass);
	await page.getByRole('button', { name: 'Ingresar' }).click();
	await page.waitForURL('**/home**', { timeout: 15_000 });
}

export async function expectNoThreeDSModal(page: Page): Promise<void> {
	// Helper explícito para casos donde el flujo NO debería disparar autenticación 3DS.
	await expect(page.getByTestId('3ds-modal-overlay')).toBeHidden({ timeout: 5_000 });
}

// Reexportamos helpers y page objects para que una spec de gateway pueda armar
// el journey completo desde este mismo archivo de fixtures.
export { extractTravelIdFromUrl, setupTravelWithFailed3DS } from '../helpers/gateway-pg/stripe.helpers';
export { NewTravelPage, ThreeDSModal, ThreeDSErrorPopup, TravelDetailPage, TravelManagementPage };
