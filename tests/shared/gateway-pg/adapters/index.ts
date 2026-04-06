import type { PaymentGateway } from '../../contracts/gateway-pg';
import { authorizeGatewayAdapter } from './authorizeGatewayAdapter';
import { ebizchargeGatewayAdapter } from './ebizchargeGatewayAdapter';
import { mercadoPagoGatewayAdapter } from './mercadoPagoGatewayAdapter';
import { stripeGatewayAdapter } from './stripeGatewayAdapter';
import type { GatewayPgAdapter } from './types';

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
