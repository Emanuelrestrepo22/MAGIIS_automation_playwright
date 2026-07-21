# Regresión gateway en ENV=test — 212 tests (project gateway-pg-chromium)

**2026-07-17** · Resultado: **0 passed · 94 failed · 118 skipped (fixme/condicional)**.

Ningún TC de gateway pasa en `test`. Causa dominante: gap de entorno (falta método de pago Preautorizada/Stripe). Ver docs/reports/ENV-TEST-GATEWAY-PAYMENT-GAP.md.

## ENTORNO: falta metodo de pago Preautorizada/Stripe en apps-test — 53

- `(sin-ID)` — _parametrized/hold-happy-no3ds.parametrized.spec.ts
- `(sin-ID)` — stripe/unit/stripe-card-declined.unit.spec.ts
- `TS-STRIPE-TC1087` — stripe/web/carrier/cargo-a-bordo/apppax-cargo-antifraud.spec.ts
- `TS-STRIPE-TC1088` — stripe/web/carrier/cargo-a-bordo/apppax-cargo-antifraud.spec.ts
- `TS-STRIPE-TC1090` — stripe/web/carrier/cargo-a-bordo/apppax-cargo-antifraud.spec.ts
- `TS-STRIPE-TC1091` — stripe/web/carrier/cargo-a-bordo/apppax-cargo-antifraud.spec.ts
- `TS-STRIPE-TC1082` — stripe/web/carrier/cargo-a-bordo/apppax-cargo-declines.spec.ts
- `TS-STRIPE-TC1083` — stripe/web/carrier/cargo-a-bordo/apppax-cargo-declines.spec.ts
- `TS-STRIPE-TC1084` — stripe/web/carrier/cargo-a-bordo/apppax-cargo-declines.spec.ts
- `TS-STRIPE-TC1085` — stripe/web/carrier/cargo-a-bordo/apppax-cargo-declines.spec.ts
- `TS-STRIPE-TC1086` — stripe/web/carrier/cargo-a-bordo/apppax-cargo-declines.spec.ts
- `TS-STRIPE-TC1107` — stripe/web/carrier/cargo-a-bordo/contractor-cargo-3ds.spec.ts
- `TS-STRIPE-TC1108` — stripe/web/carrier/cargo-a-bordo/contractor-cargo-3ds.spec.ts
- `TS-STRIPE-TC1109` — stripe/web/carrier/cargo-a-bordo/contractor-cargo-3ds.spec.ts
- `TS-STRIPE-TC1110` — stripe/web/carrier/cargo-a-bordo/contractor-cargo-3ds.spec.ts
- `TS-STRIPE-TC1102` — stripe/web/carrier/cargo-a-bordo/contractor-cargo-antifraud.spec.ts
- `TS-STRIPE-TC1103` — stripe/web/carrier/cargo-a-bordo/contractor-cargo-antifraud.spec.ts
- `TS-STRIPE-TC1104` — stripe/web/carrier/cargo-a-bordo/contractor-cargo-antifraud.spec.ts
- `TS-STRIPE-TC1105` — stripe/web/carrier/cargo-a-bordo/contractor-cargo-antifraud.spec.ts
- `TS-STRIPE-TC1106` — stripe/web/carrier/cargo-a-bordo/contractor-cargo-antifraud.spec.ts
- `TS-STRIPE-TC1097` — stripe/web/carrier/cargo-a-bordo/contractor-cargo-declines.spec.ts
- `TS-STRIPE-TC1098` — stripe/web/carrier/cargo-a-bordo/contractor-cargo-declines.spec.ts
- `TS-STRIPE-TC1099` — stripe/web/carrier/cargo-a-bordo/contractor-cargo-declines.spec.ts
- `TS-STRIPE-TC1100` — stripe/web/carrier/cargo-a-bordo/contractor-cargo-declines.spec.ts
- `TS-STRIPE-TC1101` — stripe/web/carrier/cargo-a-bordo/contractor-cargo-declines.spec.ts
- `TS-STRIPE-TC1096` — stripe/web/carrier/cargo-a-bordo/contractor-cargo-happy.spec.ts
- `TS-STRIPE-TC1111` — stripe/web/carrier/cargo-a-bordo/empresa-cargo-happy.spec.ts
- `TS-STRIPE-TC1053` — stripe/web/carrier/hold/apppax-hold-3ds.spec.ts
- `TS-STRIPE-TC1055` — stripe/web/carrier/hold/apppax-hold-3ds.spec.ts
- `TS-STRIPE-TC1061` — stripe/web/carrier/hold/apppax-hold-3ds.spec.ts
- `TS-STRIPE-TC1063` — stripe/web/carrier/hold/apppax-hold-3ds.spec.ts
- `TS-STRIPE-TC1049` — stripe/web/carrier/hold/apppax-hold-no3ds.spec.ts
- `TS-STRIPE-TC1051` — stripe/web/carrier/hold/apppax-hold-no3ds.spec.ts
- `TS-STRIPE-TC1057` — stripe/web/carrier/hold/apppax-hold-no3ds.spec.ts
- `TS-STRIPE-TC1059` — stripe/web/carrier/hold/apppax-hold-no3ds.spec.ts
- `TS-STRIPE-TC1037` — stripe/web/carrier/hold/colaborador-hold-3ds.spec.ts
- `TS-STRIPE-TC1039` — stripe/web/carrier/hold/colaborador-hold-3ds.spec.ts
- `TS-STRIPE-TC1047` — stripe/web/carrier/hold/colaborador-hold-3ds.spec.ts
- `TS-STRIPE-TC1033` — stripe/web/carrier/hold/colaborador-hold-no3ds.spec.ts
- `TS-STRIPE-TC1035` — stripe/web/carrier/hold/colaborador-hold-no3ds.spec.ts
- `TS-STRIPE-TC1043` — stripe/web/carrier/hold/colaborador-hold-no3ds.spec.ts
- `TS-STRIPE-TC1069` — stripe/web/carrier/hold/empresa-hold-3ds.spec.ts
- `TS-STRIPE-TC1065` — stripe/web/carrier/hold/empresa-hold-no3ds.spec.ts
- `TS-STRIPE-TC1073` — stripe/web/carrier/hold/empresa-hold-no3ds.spec.ts
- `TS-STRIPE-TC1075` — stripe/web/carrier/hold/empresa-hold-no3ds.spec.ts
- `(sin-ID)` — stripe/web/carrier/hold/hold-capture.spec.ts
- `(sin-ID)` — stripe/web/carrier/recovery/3ds-failure.spec.ts
- `(sin-ID)` — stripe/web/carrier/recovery/3ds-retry-card-change.spec.ts
- `(sin-ID)` — stripe/web/carrier/recovery/recorded-3ds-happy-path.spec.ts
- `TS-STRIPE-P2-TC005` — stripe/web/contractor/colaborador-hold-3ds.spec.ts
- `TS-STRIPE-P2-TC006` — stripe/web/contractor/colaborador-hold-3ds.spec.ts
- `TS-STRIPE-P2-TC001` — stripe/web/contractor/colaborador-hold-no3ds.spec.ts
- `TS-STRIPE-P2-TC002` — stripe/web/contractor/colaborador-hold-no3ds.spec.ts

## ENTORNO (downstream): no se dispara el POST de viaje/hold sin pago — 19

- `TS-STRIPE-TC1054` — stripe/web/carrier/hold/apppax-hold-3ds.spec.ts
- `TS-STRIPE-TC1056` — stripe/web/carrier/hold/apppax-hold-3ds.spec.ts
- `TS-STRIPE-TC1062` — stripe/web/carrier/hold/apppax-hold-3ds.spec.ts
- `TS-STRIPE-TC1064` — stripe/web/carrier/hold/apppax-hold-3ds.spec.ts
- `TS-STRIPE-TC1050` — stripe/web/carrier/hold/apppax-hold-no3ds.spec.ts
- `TS-STRIPE-TC1052` — stripe/web/carrier/hold/apppax-hold-no3ds.spec.ts
- `TS-STRIPE-TC1058` — stripe/web/carrier/hold/apppax-hold-no3ds.spec.ts
- `TS-STRIPE-TC1060` — stripe/web/carrier/hold/apppax-hold-no3ds.spec.ts
- `TS-STRIPE-TC1038` — stripe/web/carrier/hold/colaborador-hold-3ds.spec.ts
- `TS-STRIPE-TC1046` — stripe/web/carrier/hold/colaborador-hold-3ds.spec.ts
- `TS-STRIPE-TC1048` — stripe/web/carrier/hold/colaborador-hold-3ds.spec.ts
- `TS-STRIPE-TC1034` — stripe/web/carrier/hold/colaborador-hold-no3ds.spec.ts
- `TS-STRIPE-TC1042` — stripe/web/carrier/hold/colaborador-hold-no3ds.spec.ts
- `TS-STRIPE-TC1044` — stripe/web/carrier/hold/colaborador-hold-no3ds.spec.ts
- `TS-STRIPE-TC1070` — stripe/web/carrier/hold/empresa-hold-3ds.spec.ts
- `TS-STRIPE-TC1078` — stripe/web/carrier/hold/empresa-hold-3ds.spec.ts
- `TS-STRIPE-TC1066` — stripe/web/carrier/hold/empresa-hold-no3ds.spec.ts
- `TS-STRIPE-TC1074` — stripe/web/carrier/hold/empresa-hold-no3ds.spec.ts
- `TS-STRIPE-TC1076` — stripe/web/carrier/hold/empresa-hold-no3ds.spec.ts

## ENTORNO (downstream): assert sobre UI de pago/vehiculo ausente — 11

- `TS-STRIPE-TC1117` — stripe/web/carrier/cargo-a-bordo/empresa-cargo-antifraud.spec.ts
- `TS-STRIPE-TC1118` — stripe/web/carrier/cargo-a-bordo/empresa-cargo-antifraud.spec.ts
- `TS-STRIPE-TC1119` — stripe/web/carrier/cargo-a-bordo/empresa-cargo-antifraud.spec.ts
- `TS-STRIPE-TC1120` — stripe/web/carrier/cargo-a-bordo/empresa-cargo-antifraud.spec.ts
- `TS-STRIPE-TC1121` — stripe/web/carrier/cargo-a-bordo/empresa-cargo-antifraud.spec.ts
- `TS-STRIPE-TC1112` — stripe/web/carrier/cargo-a-bordo/empresa-cargo-declines.spec.ts
- `TS-STRIPE-TC1113` — stripe/web/carrier/cargo-a-bordo/empresa-cargo-declines.spec.ts
- `TS-STRIPE-TC1114` — stripe/web/carrier/cargo-a-bordo/empresa-cargo-declines.spec.ts
- `TS-STRIPE-TC1115` — stripe/web/carrier/cargo-a-bordo/empresa-cargo-declines.spec.ts
- `TS-STRIPE-TC1116` — stripe/web/carrier/cargo-a-bordo/empresa-cargo-declines.spec.ts
- `(sin-ID)` — stripe/web/carrier/recovery/recorded-3ds-preauth-failure.spec.ts

## ENTORNO: pasajero sin tarjeta (no se puede vincular en test) — 5

- `TS-STRIPE-TC1092` — stripe/web/carrier/cargo-a-bordo/apppax-cargo-3ds.spec.ts
- `TS-STRIPE-TC1093` — stripe/web/carrier/cargo-a-bordo/apppax-cargo-3ds.spec.ts
- `TS-STRIPE-TC1094` — stripe/web/carrier/cargo-a-bordo/apppax-cargo-3ds.spec.ts
- `TS-STRIPE-TC1095` — stripe/web/carrier/cargo-a-bordo/apppax-cargo-3ds.spec.ts
- `TS-STRIPE-TC1081` — stripe/web/carrier/cargo-a-bordo/apppax-cargo-happy.spec.ts

## APPIUM: sin device/servidor (fase movil) — 4

- `TC-PAX-BIZ-05` — stripe/e2e-mobile/apppax-business-3ds.e2e.spec.ts
- `TC-PAX-BIZ-01` — stripe/e2e-mobile/apppax-business-no3ds.e2e.spec.ts
- `TC-PAX-01` — stripe/e2e-mobile/apppax-personal-3ds.e2e.spec.ts
- `TC-PAX-07` — stripe/e2e-mobile/apppax-personal-no3ds.e2e.spec.ts

## OTRO: revisar individualmente — 2

- `TS-STRIPE-TC1089` — stripe/web/carrier/cargo-a-bordo/apppax-cargo-antifraud.spec.ts
- `TS-STRIPE-P2-TC078` — stripe/web/carrier/operaciones/edicion-programados.spec.ts

