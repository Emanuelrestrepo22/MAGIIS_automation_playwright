// tests/features/gateway-pg/pages/index.ts
// Superficie canónica de POMs propios de la feature gateway-pg (Stripe 3DS + card-linking).
// Los POMs del sustrato compartido (NewTravelPage, DashboardPage, TravelDetail/Management,
// OperationalPreferences, LoginPage, SuperPage, BasePage) NO viven acá — siguen en
// `tests/pages/{carrier,shared}/` porque los reusan todas las features.
export { ThreeDSModal } from './ThreeDSModal';
export { ThreeDSErrorPopup } from './ThreeDSErrorPopup';
// `GatewayPgCardLinkingPage` (stub) eliminado 2026-07-29: sus dos métodos eran TODOs vacíos y el
// problema que planteaba ("form de tarjeta compartido, con branch solo donde el gateway diverge")
// ya está resuelto por el Strategy `@ui/carrier/card-forms` — ver `cardFormFor(gateway)`.
