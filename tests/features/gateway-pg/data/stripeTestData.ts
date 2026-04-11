import { getCurrentEnv } from '../../../config/runtime';
import { PASSENGERS } from './passengers';
import {
	STRIPE_TEST_CARDS as TEST_STRIPE_CARD_FIXTURES,
	TEST_STRIPE_CARD_CVC,
	TEST_STRIPE_CARD_EXPIRY,
	TEST_STRIPE_CARD_HOLDER_NAME,
	TEST_STRIPE_CARD_ZIP_CODE,
} from './stripe-cards';

const currentEnv = getCurrentEnv();
const isTestEnv = currentEnv === 'test';

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing ${name} for ${currentEnv} environment`);
	}

	return value;
}

function resolveCardNumber(envName: string, testValue: string): string {
	return isTestEnv ? testValue : requireEnv(envName);
}

export const STRIPE_TEST_CARDS = {
	successDirect: resolveCardNumber('STRIPE_CARD_SUCCESS_DIRECT', TEST_STRIPE_CARD_FIXTURES.visa_success.number),
	success3DS: resolveCardNumber('STRIPE_CARD_SUCCESS_3DS', TEST_STRIPE_CARD_FIXTURES.visa_3ds_success.number),
	fail3DS: resolveCardNumber('STRIPE_CARD_FAIL_3DS', TEST_STRIPE_CARD_FIXTURES.visa_3ds_fail.number),
	insufficientFunds: resolveCardNumber('STRIPE_CARD_INSUFFICIENT_FUNDS', TEST_STRIPE_CARD_FIXTURES.declined_funds.number),
	declined: resolveCardNumber('STRIPE_CARD_DECLINED', TEST_STRIPE_CARD_FIXTURES.declined_generic.number),
	threeDSRequired: resolveCardNumber('STRIPE_CARD_3DS_REQUIRED', TEST_STRIPE_CARD_FIXTURES.three_ds_required.number),
	alwaysAuthenticate: resolveCardNumber('STRIPE_CARD_ALWAYS_AUTHENTICATE', TEST_STRIPE_CARD_FIXTURES.always_authenticate.number),
	mastercardDebit: resolveCardNumber('STRIPE_CARD_MASTERCARD_DEBIT', TEST_STRIPE_CARD_FIXTURES.mastercard_debit.number),
	lostCard: resolveCardNumber('STRIPE_CARD_LOST', TEST_STRIPE_CARD_FIXTURES.lost_card.number),
	stolenCard: resolveCardNumber('STRIPE_CARD_STOLEN', TEST_STRIPE_CARD_FIXTURES.stolen_card.number),
	incorrectCvc: resolveCardNumber('STRIPE_CARD_INCORRECT_CVC', TEST_STRIPE_CARD_FIXTURES.incorrect_cvc.number),
	expiredCard: resolveCardNumber('STRIPE_CARD_EXPIRED', TEST_STRIPE_CARD_FIXTURES.expired_card.number),
	highestRisk: resolveCardNumber('STRIPE_CARD_HIGHEST_RISK', TEST_STRIPE_CARD_FIXTURES.highest_risk.number),
	alwaysBlocked: resolveCardNumber('STRIPE_CARD_ALWAYS_BLOCKED', TEST_STRIPE_CARD_FIXTURES.always_blocked.number),
	cvcCheckFail: resolveCardNumber('STRIPE_CARD_CVC_CHECK_FAIL', TEST_STRIPE_CARD_FIXTURES.cvc_check_fail.number),
	zipFailElevated: resolveCardNumber('STRIPE_CARD_ZIP_FAIL_ELEVATED', TEST_STRIPE_CARD_FIXTURES.zip_fail_elevated.number),
	addressUnavailable: resolveCardNumber('STRIPE_CARD_ADDRESS_UNAVAILABLE', TEST_STRIPE_CARD_FIXTURES.address_unavailable.number),
} as const;

export const STRIPE_EXPIRY = isTestEnv ? TEST_STRIPE_CARD_EXPIRY : requireEnv('STRIPE_CARD_EXPIRY');
export const STRIPE_CVC = isTestEnv ? TEST_STRIPE_CARD_CVC : requireEnv('STRIPE_CARD_CVC');
export const STRIPE_BILLING_ZIP = isTestEnv ? TEST_STRIPE_CARD_ZIP_CODE : requireEnv('STRIPE_CARD_ZIP_CODE');
export const STRIPE_CARD_HOLDER_NAME = isTestEnv ? TEST_STRIPE_CARD_HOLDER_NAME : requireEnv('STRIPE_CARD_HOLDER_NAME');

export const TEST_DATA = {
	// Default carrier flow: el cliente auto-completa el pasajero y deja "Regular" listo.
	client: PASSENGERS.empresaIndividuo.name,
	passenger: PASSENGERS.appPax.name,
	// Casos que requieren cliente y pasajero distintos.
	contractorClient: 'fast car',
	contractorPassenger: PASSENGERS.colaborador.name,
	appPaxPassenger: PASSENGERS.appPax.name,
	origin: 'Reconquista 661, Buenos Aires, Argentina',
	destination: 'Cazadores 1987, Buenos Aires, Argentina',
} as const;
