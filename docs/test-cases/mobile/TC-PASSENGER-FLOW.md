# TC-PASSENGER-FLOW

Passenger App coverage for Flow 2.

Target specs:

- `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-no3ds.e2e.spec.ts`
- `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-3ds.e2e.spec.ts`
- `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-no3ds.e2e.spec.ts`
- `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-3ds.e2e.spec.ts`

## Personal lane

### No 3DS

| ID | Title | Source case ID | Portal | App | Environment | Flow | Priority | Target spec path | Required screen objects | Technical risks / gaps |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-PAX-07 | Add card to passenger wallet | TS-STRIPE-TC1009 / TS-STRIPE-TC1011 | pax | passenger | test | passenger-app-driver-app | P1 | `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-no3ds.e2e.spec.ts` | `Modo Personal`, `Mi cuenta`, `Billetera`, `AGREGAR`, `GUARDAR`, Stripe iframe `cardnumber` / `cc-exp-month` / `cc-exp-year` / `cc-csc` | Wallet state can persist across runs when `APPIUM_NO_RESET=true`; Stripe iframe name can vary while the same inputs stay available. |
| TC-PAX-08 | Select an existing card for a trip | TS-STRIPE-TC1010 / TS-STRIPE-TC1012 | pax | passenger | test | passenger-app-driver-app | P1 | `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-no3ds.e2e.spec.ts` | `Modo Personal`, `Mi cuenta`, `Billetera`, saved card label with last 4 digits | The selected card can already be the default one; card label formatting may differ between builds. |
| TC-PAX-09 | Create trip from passenger app | TS-STRIPE-TC1011 / TS-STRIPE-TC1012 | pax | passenger | test | passenger-app-driver-app | P1 | `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-no3ds.e2e.spec.ts` | `Modo Personal`, `Origen`, `Destino`, `Seleccionar Vehiculo`, `Ahora`, `Efectivo`, `Tarjeta de crédito` | Trip confirmation may not return a stable trip id on every build; payment methods can vary depending on profile state and carrier defaults. |
| TC-PAX-10 | See trip in progress / assigned driver | TS-STRIPE-TC1010 / TS-STRIPE-TC1011 | pax | passenger | test | passenger-app-driver-app | P1 | `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-no3ds.e2e.spec.ts` | `Modo Personal`, `assigned driver keywords`, `conductor`, `driver`, `en camino` | Driver handoff is not wired in this lane yet; status detection is currently keyword-based until a dedicated passenger post-trip dump is captured. |

### 3DS

| ID | Title | Source case ID | Portal | App | Environment | Flow | Priority | Target spec path | Required screen objects | Technical risks / gaps |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-PAX-01 | Add card to passenger wallet | TS-STRIPE-TC1049 / TS-STRIPE-TC1053 | pax | passenger | test | passenger-app-driver-app | P1 | `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-3ds.e2e.spec.ts` | `Mi cuenta`, `Billetera`, `AGREGAR`, `GUARDAR`, Stripe iframe `cardnumber` / `cc-exp-month` / `cc-exp-year` / `cc-csc` | Wallet state can persist across runs when `APPIUM_NO_RESET=true`; Stripe iframe name can vary while inputs stay the same. |
| TC-PAX-02 | Select an existing card for a trip | TS-STRIPE-TC1050 / TS-STRIPE-TC1054 | pax | passenger | test | passenger-app-driver-app | P1 | `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-3ds.e2e.spec.ts` | `Mi cuenta`, `Billetera`, saved card label with last 4 digits | The selected card can already be the default one; card label formatting may differ between builds. |
| TC-PAX-03 | Create trip from passenger app | TS-STRIPE-TC1053 / TS-STRIPE-TC1055 | pax | passenger | test | passenger-app-driver-app | P1 | `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-3ds.e2e.spec.ts` | `Origen`, `Destino`, `Seleccionar Vehiculo`, `Ahora` | Trip confirmation may not return a stable trip id on every build; backend can branch into hold / 3DS depending on config. |
| TC-PAX-04 | See trip in progress / assigned driver | TS-STRIPE-TC1054 / TS-STRIPE-TC1062 | pax | passenger | test | passenger-app-driver-app | P1 | `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-3ds.e2e.spec.ts` | `conductor`, `driver`, `en camino` | Driver handoff is not wired in this lane yet; status detection is currently keyword-based until a dedicated passenger post-trip dump is captured. |
| TC-PAX-05 | See trip completed and payment processed | TS-STRIPE-TC1055 / TS-STRIPE-TC1061 | pax | passenger | test | passenger-app-driver-app | P1 | `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-3ds.e2e.spec.ts` | `completado`, `finalizado`, `cobro`, `pago`, `captured` | Depends on driver completion first; payment confirmation remains heuristic until passenger post-trip evidence is added. |
| TC-PAX-06 | Reject card save / validation failure | TS-STRIPE-TC1056 | pax | passenger | test | passenger-app-driver-app | P2 | `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-3ds.e2e.spec.ts` | Stripe error copy, validation feedback, modal / toast error surface | Negative save flow can close the iframe early; exact error copy may vary by Stripe branch and app build. |
| TC-PAX-11 | Delete 3DS card from passenger wallet | TS-STRIPE-TC1122 | pax | passenger | test | passenger-app-driver-app | P2 | `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-3ds.e2e.spec.ts` | `Mi cuenta`, `Billetera`, saved 3DS card label with last 4 digits, delete action / menu / trash | Delete affordance is not yet validated in a dump; capture wallet evidence from home before wiring the spec. |

## Business / Collaborator lane

### No 3DS

| ID | Title | Source case ID | Portal | App | Environment | Flow | Priority | Target spec path | Required screen objects | Technical risks / gaps |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-PAX-BIZ-01 | Add card to collaborator wallet | TS-STRIPE-TC1017 / TS-STRIPE-TC1025 | pax | passenger | test | passenger-app-driver-app | P1 | `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-no3ds.e2e.spec.ts` | `Compañía`, `Mi cuenta`, `Billetera`, `AGREGAR`, `GUARDAR`, Stripe iframe `cardnumber` / `cc-exp-month` / `cc-exp-year` / `cc-csc` | Business profile toggle can be disabled if the collaborator profile is not provisioned; wallet state can persist across runs when `APPIUM_NO_RESET=true`. |
| TC-PAX-BIZ-02 | Select an existing card for a business trip | TS-STRIPE-TC1018 / TS-STRIPE-TC1026 | pax | passenger | test | passenger-app-driver-app | P1 | `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-no3ds.e2e.spec.ts` | `Compañía`, `Mi cuenta`, `Billetera`, saved card label with last 4 digits | The card may already be selected as default; label formatting can vary slightly across app versions. |
| TC-PAX-BIZ-03 | Create business trip from passenger app | TS-STRIPE-TC1019 / TS-STRIPE-TC1027 | pax | passenger | test | passenger-app-driver-app | P1 | `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-no3ds.e2e.spec.ts` | `Compañía`, `Origen`, `Destino`, `Seleccionar Vehiculo`, `Ahora`, `Cuenta corriente`, `Tarjeta de crédito` | Trip confirmation can return without a stable trip id on some builds; business payment defaults can vary if the profile exposes checking account first. |
| TC-PAX-BIZ-04 | See business trip in progress / assigned driver | TS-STRIPE-TC1020 / TS-STRIPE-TC1028 | pax | passenger | test | passenger-app-driver-app | P1 | `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-no3ds.e2e.spec.ts` | `Compañía`, assigned driver keywords, `conductor`, `driver`, `en camino` | Driver handoff is not wired in this lane yet; status detection is currently keyword-based until a dedicated dump is captured. |

### 3DS

| ID | Title | Source case ID | Portal | App | Environment | Flow | Priority | Target spec path | Required screen objects | Technical risks / gaps |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-PAX-BIZ-05 | Add card to collaborator wallet with 3DS card | TS-STRIPE-TC1021 / TS-STRIPE-TC1029 | pax | passenger | test | passenger-app-driver-app | P1 | `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-3ds.e2e.spec.ts` | `Compañía`, `Mi cuenta`, `Billetera`, `AGREGAR`, `GUARDAR`, Stripe iframe `cardnumber` / `cc-exp-month` / `cc-exp-year` / `cc-csc` | 3DS-capable cards may still branch into platform-specific validation flows; business profile toggle can be disabled if the collaborator profile is not provisioned. |
| TC-PAX-BIZ-06 | Select an existing 3DS card for a business trip | TS-STRIPE-TC1022 / TS-STRIPE-TC1030 | pax | passenger | test | passenger-app-driver-app | P1 | `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-3ds.e2e.spec.ts` | `Compañía`, `Mi cuenta`, `Billetera`, saved card label with last 4 digits | The card may already be selected as default; 3DS-capable cards can display different labels after wallet save. |
| TC-PAX-BIZ-07 | Create business trip with 3DS card | TS-STRIPE-TC1023 / TS-STRIPE-TC1031 | pax | passenger | test | passenger-app-driver-app | P1 | `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-3ds.e2e.spec.ts` | `Compañía`, `Origen`, `Destino`, `Seleccionar Vehiculo`, `Ahora`, `Cuenta corriente`, `Tarjeta de crédito` | Trip confirmation can return without a stable trip id on some builds; business payment defaults can vary if the profile exposes checking account first. |
| TC-PAX-BIZ-08 | See business trip in progress / assigned driver with 3DS | TS-STRIPE-TC1024 / TS-STRIPE-TC1032 | pax | passenger | test | passenger-app-driver-app | P1 | `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-3ds.e2e.spec.ts` | `Compañía`, assigned driver keywords, `conductor`, `driver`, `en camino` | Driver handoff is not wired in this lane yet; status detection is currently keyword-based until a dedicated dump is captured. |

## Notes

- Passenger home mode is a precondition for every flow: read the header label under the `ion-toggle` on `home` before continuing. `Modo Personal` means personal lane; `Compañía: <contractor name>` means business / collaborator lane.
- TC-PAX-01 to TC-PAX-03 and TC-PAX-07 to TC-PAX-09 are the active passenger coverage slices.
- TC-PAX-04 to TC-PAX-06 and TC-PAX-10 remain draft / `fixme` until the driver handoff and negative evidence are stable.
- TC-PAX-11 remains draft until wallet delete evidence is captured.
- TC-PAX-BIZ-04 and TC-PAX-BIZ-08 remain draft / `fixme` until passenger post-trip evidence is captured.
- The passenger lane intentionally reuses the same `tests/mobile/appium/passenger/*` screen objects for all cases.
