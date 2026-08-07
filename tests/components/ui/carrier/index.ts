/**
 * Barrel de componentes KATA UI del portal Carrier (@ui/carrier).
 * Versiones KATA (extends UiBase) de los POMs del sustrato carrier, para specs amoldados.
 */
export {
	AppStoreGatewaysPage,
	isGatewayDestructiveSwitchAllowed,
	type GatewayCompany,
	type GatewayCardState,
	type AuthorizeCreds,
	type EbizchargeCreds,
	type LinkStatusOptions
} from './AppStoreGatewaysPage';
export { CarrierDashboardPage } from './CarrierDashboardPage';
export { CarrierNewTravelPage, type NewTravelFormInput, type CargoTravelInput } from './CarrierNewTravelPage';
export { CarrierOperationalPreferencesPage } from './CarrierOperationalPreferencesPage';
export { CarrierTravelDetailPage } from './CarrierTravelDetailPage';
export { CarrierTravelManagementPage, type CloneSourceTab } from './CarrierTravelManagementPage';
// Scaffolding MG-178 (áreas quote/recurrentes/config sin POM previo).
export { CarrierQuotePage, type QuoteContact } from './CarrierQuotePage';
export { CarrierRecurrentTravelPage, type RecurrenceConfig } from './CarrierRecurrentTravelPage';
export { CarrierGlobalIntegrationsPage } from './CarrierGlobalIntegrationsPage';
