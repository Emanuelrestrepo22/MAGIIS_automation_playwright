# Arquitectura Appium POM + PBO — magiis-playwright (`tests/mobile/appium/`)

Estado: PROPUESTA (análisis, sin cambios de código). Base: worktree `mpw-f5-app`, rama `test/TM-F5-app-closure`.
Alcance: cierre de viajes por app (F5) hoy; flujos de chofer/pasajero futuros, multi-carrier / ambiente / idioma.

Suposiciones declaradas:
1. Se mantiene WebdriverIO + Appium 3 + uiautomator2 y el modelo híbrido (NATIVE_APP + WebView Ionic). Los locators estables en la WebView son clases/`app-*`/`aria-label` del DOM Ionic; `accessibility id`/`resource-id` solo aplica a lo nativo (permisos, teclado, 3DS nativo).
2. iOS no está en alcance inmediato; la arquitectura lo deja posible (capabilities por plataforma) pero no se promete.
3. Los scripts actuales (77 en `scripts/`) siguen corriendo durante toda la migración (strangler).
4. No se inventan ids de pantallas ni textos nuevos: lo citado sale del código actual.
5. Los números de línea son aproximados (lectura del worktree al 2026-11-11).

---

## 1. Diagnóstico del estado actual

### 1.1 Inventario (≈46k líneas TS en `tests/mobile/appium/`)

| Zona | Contenido | Observación |
|---|---|---|
| `base/AppiumSessionBase.ts` (608) | sesión + helpers de WebView (`tapWebText`, `waitForWebText`, `fillWebInputField`, `setDomValue`, frames) | clase base de TODAS las screens; mezcla sesión, locator strategy y esperas |
| `config/` | `appiumRuntime` (packages por ambiente/actor, capabilities), `mobileEnvFile`, `appiumMcp` | bien separado; `test/uat/prod/savio`, solo Android |
| `driver/` (13 clases) | `DriverHomeScreen`, `DriverTripRequestScreen`, `DriverTripNavigationScreen`, `DriverTripSummaryScreen`, `DriverTripCompletionScreen`, `DriverTripPaymentScreen` (1021), `DriverOtherCostsCloseScreen`, `DriverTripPreflight`, `DriverProfiles`, `DriverFlowSelectors`, baterías | núcleo reutilizable; mezcla screen + flujo + aserción |
| `passenger/` | `PassengerWalletScreen` (2476), `PassengerNewTripScreen`, `AddressFieldProbe` (1401), `AddressCaseBattery`, `surfaces/` | screens gigantes; la lógica de negocio (wallet, 3DS) vive dentro del screen |
| `harness/` | `DriverTripHappyPathHarness` (286), `DriverCargoDeclineHarness` (945), `PassengerTripHappyPathHarness` (564), `F5CloseTripPlan` (puro + unit) | los harness SON los PBO de facto, sin resultado tipado ni contrato de capas |
| `gps/` | `GpsRouteFeeder`, `RoutePlan` (puros, con unit), rutas JSON | bien aislado; solo ruta Cannes–Niza (+ variante sparse) |
| `contracts/` | `f5AppHandoff` (+unit), `mobileGatewayExecutionPlan` | espejo del contrato en `cv2-f5/tests/helpers/f5-app-handoff.ts` (copiado a mano) |
| `helpers/` | `screenEvidence`, `webViewNetworkCapture` (1650), `driverStaleTripRecovery`, `threeDsChallenge`, `emulatorGeo`, `appiumDebug` | utilitarios transversales |
| `scripts/` | 77 archivos; 72 llaman `remote(` directo; ≈20 son `dump-*`, ≈25 `passenger-mg116-*`/`driver-mg117-*`, 5 `_tmp-mg626-*` | runners ad hoc |
| `*/specs/` | 5 specs (pax/driver address, other-costs, new-trip-blocked) | única capa spec formal |

### 1.2 Mezcla de responsabilidades y deuda (con evidencia)

| # | Problema | Evidencia (archivo:línea aprox.) | Impacto |
|---|---|---|---|
| D1 | 72 de 77 scripts abren su sesión con `remote({...})` en vez de pasar por `AppiumSessionBase`/harness | `scripts/_quarantine/accept-trip-and-dump.ts:67`, `_quarantine/close-trip-summary.ts:58`, `_quarantine/driver-cargo-payment-validate.ts:113`, `_quarantine/driver-availability-hang-repro.ts:197` | cambiar capabilities/timeouts/teardown = 72 ediciones; el guard de `deleteSession` (20 s) de `AppiumSessionBase.endSession` no aplica |
| D2 | Screens heredan de la base que crea la sesión: cada Screen "es dueña" del driver; el harness crea `DriverHomeScreen` solo para arrancar y luego "bindea" las otras | `harness/DriverTripHappyPathHarness.ts` (`this.homeScreen.startSession()` + `bindScreens`) | acoplamiento herencia-sesión; imposible dos actores (chofer + pasajero) limpios en una prueba |
| D3 | Locator strategy dentro de la Screen, con heurística de texto/regex de dominio | `driver/DriverTripNavigationScreen.ts:60-100`: `/iniciar\|empezar\|finalizar\|cerrar\|recoger\|viaje\|trip/` y `.replace(/\[\*?@text=/g,'')` (parsea un xpath como string para convertirlo en texto) | frágil, dependiente de idioma, difícil de depurar |
| D4 | Textos i18n hardcodeados ES/EN en selectors | `driver/DriverFlowSelectors.ts` `DRIVER_UI_TEXTS` (incluye `"Tomar viaje"` legado; `closeTrip` incluye `Finalizar Viaje`, que es también `endTrip`) | no escala a FR/PT; riesgo de tap en el botón equivocado (cierre vs. fin de viaje) |
| D5 | Variables del perfil "FR" hardcodeadas en código genérico, aunque ya existe `DriverProfiles` | `driver/DriverTripPreflight.ts:56-59` y `:215-216` (`DRIVER_EMAIL_FR`, `DRIVER_PASSWORD_FR`, `DRIVER_DISPLAY_NAME_FR`) | el preflight no es reutilizable por otro carrier sin tocar la screen |
| D6 | Ruta GPS por defecto única y `GPS_ROUTE_FILE` mutado en `process.env` | `scripts/f5-driver-close-trip.ts` (`DEFAULT_ROUTE`, `process.env.GPS_ROUTE_FILE = ...`), `gps/GpsRouteFeeder.ts:87` | sin ruta por región/carrier; estado global impide paralelismo en el mismo proceso |
| D7 | Esperas por `pause` fijo dentro de screens (~130 ocurrencias) | `DriverTripNavigationScreen.ts:137,167,225,275` (`driver.pause(500/1500/3000)`); `PassengerWalletScreen` 29, `DriverCargoDeclineHarness` 20, `AddressFieldProbe` 19 | flakiness y tiempo muerto; viola "sin sleeps salvo diagnóstico" |
| D8 | Decisiones/aserciones de negocio dentro de screens | `DriverTripSummaryScreen.ts:~173-202` (`confirmAndFinish` decide flujo normal vs. firma por el texto del botón y devuelve `string`) y `:~400-406` (`assertPaymentMethod`) | el PBO no puede reutilizar la screen (p. ej. leer sin cerrar) |
| D9 | Resultado de flujo sin tipo de dominio: el harness devuelve `{totalAmount: string, paymentMethod: string}` y el script lo traduce al contrato | `DriverTripHappyPathResult`; `scripts/f5-driver-close-trip.ts` (`parseMoneyText`, `withClosure`, `withFailure`) | "qué pasó" vive en el script; otro runner lo reescribiría |
| D10 | Orquestación + irreversibilidad en el script: guard de mock GPS ajeno, `F5_APP_CLOSE`/`--confirm`, `adb stopservice`, mapeo a handoff | `scripts/f5-driver-close-trip.ts` (~190 l) | no testeable sin emulador salvo lo ya extraído en `F5CloseTripPlan` (buen precedente) |
| D11 | Dos screens para el tramo resumen/cierre | `DriverTripSummaryScreen` (429 l) vs. `DriverTripCompletionScreen` (273 l) y `gateway-pg/DriverTripCompletionDraft.ts` | duplicación; canónica no clara |
| D12 | Screens-dios | `PassengerWalletScreen.ts` (2476), `AddressFieldProbe.ts` (1401), `DriverTripPaymentScreen.ts` (1021): stripe/3DS/wallet juntos | irrevisables; mezclan POM, PBO y datos |
| D13 | Contrato con cv2-f5 duplicado a mano | `contracts/f5AppHandoff.ts` ↔ `C:/worktrees/cv2-f5/tests/helpers/f5-app-handoff.ts` (539 l; "REPLICAN... no se importa cross-repo") | deriva silenciosa; la red son solo fixtures |
| D14 | Scripts temporales/exploración versionados | `scripts/_tmp-mg626-*.ts` (5), ≈20 `dump-*` | ruido; no se sabe qué es canónico |

Lo que ya está bien y se conserva: `F5CloseTripPlan` (puro, con unit, mismo plan para `--dry-run` y corrida real), `f5AppHandoff` (parser estricto, escritura atómica), `GpsRouteFeeder`/`RoutePlan` (puros), `DriverProfiles` (nombres de clave de env, no valores), `appiumRuntime`, `ScreenEvidence`, convención `*.unit.ts`.

---

## 2. Arquitectura propuesta

### 2.1 Capas

```
 specs / runners (CLI, runner Playwright)          <- qué se corre; sin lógica
        |
 flows/        orquestación E2E multi-actor        <- F5 cierre por app, alta->asignar->cerrar->rendir
        |
 pbo/          Page Business Objects por dominio   <- operaciones de negocio con resultado tipado
        |
 screens/      POM: 1 clase por pantalla/actor     <- locators + acciones atómicas + estado observable
        |
 core/         sesión, capabilities, waits, locator strategy, i18n, evidencia, gates

 contracts/    handoffs con cv2-f5 (tipos + parse)  <- usados por flows/ y runners
 data/         perfiles, carriers, rutas GPS, textos i18n   <- datos puros, sin Appium
```

#### Core (`core/`)
- `MobileSession` (composición, no herencia): crea/cierra el driver con las capabilities de `config/`, conserva el `endSession` con timeout de 20 s, expone `driver`, `context` (`native|webview`) y `evidence`. Reemplaza el rol "sesión" de `AppiumSessionBase` (D1, D2).
- `Waits`: `until(cond, {timeout, interval, label})` y `waitForWebVisible(locator)`; único lugar con `pause`. Resuelve D7.
- `Locator`: `{ id; web?; native?; textKey? }`. Orden de preferencia: `accessibility id`/`resource-id` (nativo) → clase/`app-*`/`aria-label` (WebView) → texto i18n por locale (último recurso). Sin xpath con texto en screens (D3).
- `I18n`: `t(locale, key)` sobre `data/i18n/{es,en,fr,pt}.json` (fuente: `src/assets/i18n` de `magiis-mobile-driver-v2`, ya citada en `DriverFlowSelectors`). Las screens piden `key`, no texto (D4); las variantes legado viven en el JSON.
- `Evidence`: wrapper de `ScreenEvidence` (checkpoint -> captura), sin cambiar contrato.
- `Gates`: guards de irreversibilidad reutilizables (`F5_APP_CLOSE`, `--confirm`, mock GPS ajeno vía adb) extraídos de `f5-driver-close-trip.ts` (D10).

#### POM — Screens (`screens/driver/*`, `screens/passenger/*`)
Reglas:
1. Una clase por pantalla identificable (TripConfirm, TripToStart, TripInProgress, TripResume/Summary, Home, Payment, Signature).
2. Solo: locators privados + acciones atómicas (`tapAccept()`, `readTotalText()`) + estados observables (`isShown()`, `waitUntilShown()`).
3. Sin aserciones de negocio, sin `if` de dominio (p. ej. "si el botón dice Firmar..."), sin `process.env`.
4. Reciben `MobileSession` + `Locale` por constructor.
5. Una Screen no llama a otra; navegar es responsabilidad del PBO.
6. Una Screen > ~300 líneas se parte en componentes (`components/CardForm`, `ConfirmModal`, `SignaturePad`). Caso real: el modal Sí/No (`app-confirm-modal`) está duplicado para start y end (`DriverTripNavigationScreen.ts:~237-261` y `:~354-378`).

#### PBO (`pbo/`)
Un objeto por dominio de negocio; compone screens y expone verbos con resultado tipado:

| PBO | Operaciones | Resultado tipado | Reemplaza |
|---|---|---|---|
| `DriverSessionPBO` | `ensureLoggedIn(profile)`, `goOnline()`, `assertIdentity(expect)` | `{ driverName, online }` | `DriverTripPreflight`, `DriverHomeScreen.goOnline` |
| `TripLifecyclePBO` (driver) | `acceptOffer({expectedTravelId})`, `startTrip()`, `endTrip()`, `closeTrip()` | `AcceptResult`, `StartResult`, `EndResult`, `CloseResult{totalText, total, closeButton, checkpoints}` | `DriverTripHappyPathHarness.runHappyPath` (descompuesto) |
| `PaymentPBO` | `selectMethod(last4?)`, `payWithCard(card)`, `handle3DS(action)` | `PaymentOutcome` | parte de negocio de `DriverTripPaymentScreen`, `threeDsChallenge` |
| `SignaturePBO` | `signIfRequired()` | `{required, signed}` | `DriverTripSummaryScreen.signAndConfirm/confirmAndFinish` |
| `GpsSimulationPBO` | `feedRoute(plan, {stepMeters, intervalMs})` | `{fedMeters, theoreticalMeters, aborted}` | `GpsRouteFeeder` + guard de mock en el script |
| `OtherCostsPBO` (driver) | `addToll`, `addParking`, `closeWithOtherCosts` | `OtherCostsResult` | `DriverOtherCostsCloseScreen` |
| `PassengerTripPBO` | `requestTrip(spec)`, `cancelActive()`, `waitForStatus(s)` | `PaxTripState` | `PassengerTripHappyPathHarness`, `PassengerNewTripScreen` |
| `PassengerWalletPBO` | `addCard`, `deleteCard`, `restoreCard` | `WalletState` | `PassengerWalletScreen` (2476 l) |

Reglas PBO: (a) nunca locators; (b) precondiciones como errores tipados (`TripOfferMismatchError`, `GpsAbortedError`); las aserciones de verificación final van en el spec; (c) un PBO por dominio, solo si hay >= 2 consumidores reales; (d) operaciones irreversibles marcadas y detrás de `Gates`.

#### Flows (`flows/`)
Secuencias entre PBOs y contratos. Primer flow: `F5AppCloseFlow.run(plan, handoff)` = preflight -> `DriverSessionPBO` -> `TripLifecyclePBO.acceptOffer` -> `startTrip` -> `GpsSimulationPBO` -> `endTrip` -> `closeTrip` -> `withClosure`/`withFailure`. Es lo que hoy hace `scripts/f5-driver-close-trip.ts`, movido a una clase testeable con PBOs inyectados (fakes en unit, igual que `F5CloseTripPlan.unit.ts`).

#### Contracts / Data
- `contracts/f5AppHandoff.ts` se queda. Para D13: mantener copia + unit que valida los fixtures `f5-app-handoff.{prepared,closed}.json` de cv2-f5 con `parseF5AppHandoff`; `schemaVersion` sube en ambos lados. (Paquete compartido: descartado por costo hoy.)
- `data/profiles/`: `driver-profiles.ts` (hoy `DriverProfiles`) y `carriers.ts` (`carrierId -> {region, locale, currency, routeId}`). `data/gps/routes/<region>/*.json` (hoy `gps/routes`). Los perfiles siguen siendo nombres de clave de env, nunca valores.

### 2.2 Dependencias permitidas (ASCII)

```
 specs/runners --> flows --> pbo --> screens --> core
      |             |         |         |          ^
      |             |         |         +--> data/i18n (vía core/I18n)
      |             +---------+--> contracts       |
      |             +-----------> data/profiles, data/gps
      +-- (solo parsea argv, llama a un flow, exit code)

 Prohibido: screens -> pbo | flows ; pbo -> flows ; screens -> screens ;
            core -> screens | pbo ; process.env fuera de core/Config y runners ;
            aserciones de negocio en screens
```
Chequeo sugerido: `eslint-plugin-boundaries` o un grep en CI (`screens/**` no importa `../pbo`).

### 2.3 Estructura y convenciones

```
tests/mobile/appium/
  core/        MobileSession.ts  Waits.ts  Locator.ts  I18n.ts  Gates.ts  Evidence.ts  Config.ts
  screens/
    driver/    HomeScreen.ts  TripConfirmScreen.ts  TripToStartScreen.ts  TripInProgressScreen.ts
               TripResumeScreen.ts  components/{ConfirmModal,SignaturePad,CardForm}.ts
    passenger/ HomeScreen.ts  NewTripScreen.ts  WalletScreen.ts  TripStatusScreen.ts
  pbo/         DriverSessionPBO.ts  TripLifecyclePBO.ts  PaymentPBO.ts  SignaturePBO.ts
               GpsSimulationPBO.ts  PassengerTripPBO.ts  *.types.ts
  flows/       F5AppCloseFlow.ts  DriverCargoDeclineFlow.ts ...
  contracts/   (existente)
  data/        profiles/  carriers.ts  gps/routes/<region>/  i18n/{es,en,fr,pt}.json
  specs/       <actor>/<feature>.spec.ts
  runners/     f5-driver-close-trip.ts (delgado)
  scripts/     (existente; diagnostics/ al final)
```
Nombres: `<Pantalla>Screen`, `<Dominio>PBO`, `<Flujo>Flow`, `<Verbo>Result`; unit puros `*.unit.ts` junto al archivo (convención vigente). Specs/TC: `ID-validar-modulo`; commits con `[TC-ID]`.

---

## 3. Escalabilidad

| Eje | Hoy | Propuesta |
|---|---|---|
| Carrier / región | un perfil FR (`fr-1901`) + ruta Cannes–Niza | `data/carriers.ts` mapea `carrierId -> {region, locale, currency, routeId}`; la ruta GPS sale del carrier, no de `process.env`; nuevos choferes = datos en `DriverProfiles`, no código |
| Idioma | listas ES/EN en `DRIVER_UI_TEXTS` | `I18n.t(locale,key)` con JSON por idioma extraído de `magiis-mobile-driver-v2/src/assets/i18n`; el locale viene del carrier (FR -> `fr`). Unit: las keys usadas por screens deben existir en todos los JSON |
| Moneda / formato | `parseMoneyText` ya admite `$1,645.00`, `1.645,00 €`, `1 645,00` | se queda en `contracts/`; casos por locale en su unit |
| Dispositivos en paralelo | una sesión por script; mock GPS global por emulador | un `MobileSession` por actor/dispositivo con `udid` y puertos (`systemPort`, `chromedriverPort`) propios; regla "un chofer por dispositivo" (header de `DriverProfiles`) y storage/perfil por worker (memoria `feedback-storage-state-por-worker`); `GpsSimulationPBO` toma el lock del mock por udid; sin `process.env` mutable (D6) |
| Android / iOS | solo UiAutomator2 | `MobileSession` elige `buildCapabilities(platform)`; las screens WebView son comunes (mismo DOM); lo nativo se encapsula en componentes `Native*`; iOS queda como puerto abierto |
| Builds por ambiente | `APP_PACKAGES` test/uat/prod/savio ya existe | se mantiene; el flujo de release (TEST -> UAT -> PROD, tiendas al final) decide qué `appPackage` usa el spec; `F5CloseTripPlan` ya bloquea fuera de TEST: se generaliza a una tabla de políticas por flow |
| Reuso driver/pasajero | `PassengerWalletScreen` y `DriverTripPaymentScreen` repiten formulario de tarjeta/3DS | `components/CardForm` y `Stripe3DS` compartidos vía `PaymentPBO` |
| Flujo nuevo sin tocar capas inferiores | se copia un script de 400+ líneas | se escribe un `Flow` combinando PBOs; solo si falta un verbo se agrega al PBO; solo si falta una pantalla se agrega un Screen; las capas inferiores no se modifican |

Trade-off: composición (`MobileSession`) vs. herencia actual. Migrar 13 screens cuesta; se mitiga con un adaptador (`AppiumSessionBase` envuelve `MobileSession`) y migrando primero solo el camino F5. Recomendación: composición.

---

## 4. Plan de migración incremental (strangler)

Principio: no se borra ni renombra nada que un script use; lo nuevo convive en carpetas nuevas y los viejos se reapuntan al final. Cada paso cierra con `tsc` + unit en verde (en OneDrive tsc/runner local falla: verificar desde `C:/dev/wt`) y el `--dry-run` de F5 intacto.

| # | Paso | Horas | Criterio de done |
|---|---|---|---|
| 0 | Congelar baseline: `--dry-run` de `f5-driver-close-trip.ts` + unit actuales; decidir canónica Summary vs. Completion (D11) | 1,5 | salida del dry-run guardada; nota de canónica |
| 1 | `core/`: `MobileSession` (extraído de `startSession/endSession`), `Waits.until`, `Gates` (extraído del script), `I18n` + `data/i18n/{es,en,fr}.json` con las keys de `DRIVER_UI_TEXTS`. `AppiumSessionBase` delega a `MobileSession` sin cambiar su API pública | 8 | unit de `Waits`, `Gates`, `I18n` (key faltante falla); los scripts existentes arrancan igual |
| 2 | `screens/driver` del camino F5: `TripConfirm`, `TripToStart`, `TripInProgress`, `TripResume`, `ConfirmModal`, `SignaturePad`. Locators por clase/`app-*` (ya en `DRIVER_CHECKPOINT_SELECTORS`/`DRIVER_ACTION_SELECTORS`) + textos vía `I18n`; sin `pause`, sin aserciones; se elimina el parseo xpath-como-texto (D3) | 12 | cero `driver.pause` ni `//*[@text` en `screens/`; cada Screen < 300 l; contrastado con DOM dump del emulador |
| 3 | `pbo/`: `DriverSessionPBO`, `TripLifecyclePBO`, `SignaturePBO`, `GpsSimulationPBO` con resultados tipados; preflight generalizado por perfil (D5) | 10 | PBOs sin locators; unit con screens fake; preflight acepta cualquier `DriverProfile` (sin `_FR` en código) |
| 4 | `flows/F5AppCloseFlow` + `runners/f5-driver-close-trip.ts` delgado (argv -> plan -> flow -> handoff); el script viejo queda como wrapper | 6 | un viaje cerrado en TEST con el flow nuevo produce el mismo handoff `closed` que el viejo (`measured`/`result`); `--dry-run` idéntico al baseline |
| 5 | `data/carriers.ts` + rutas GPS por región; quitar `process.env.GPS_ROUTE_FILE` mutable; unit de resolución carrier -> locale/ruta/moneda | 4 | segundo carrier = 1 entrada de datos, 0 cambios de código (probado en unit con carrier simulado) |
| 6 | Contrato cv2-f5: unit que valida los 2 fixtures con `parseF5AppHandoff` + `schemaVersion` compartido | 2 | test rojo si cambia el schema de un solo lado |
| 7 | Reapuntar `fr-driver-s3-closure.ts`, `driver-accept-complete-trip.ts`, `validate-driver-happy-path.ts` a flows/PBO; `DriverTripHappyPathHarness` deprecated | 5 | los 3 scripts corren sobre PBO; el harness no tiene más consumidores |
| 8 | Pasajero y componentes compartidos: `CardForm`, `Stripe3DS`; partir `PassengerWalletScreen`/`DriverTripPaymentScreen`; `PassengerTripPBO`/`PassengerWalletPBO` | 24 | ninguna clase > 300 l; specs pax actuales pasan sin cambio funcional |
| 9 | Higiene de scripts: migrar los 72 `remote(` a `MobileSession`; mover `dump-*` a `scripts/diagnostics/`; `_tmp-mg626-*` se borra solo con confirmación del usuario | 10 | `remote(` solo en `MobileSession`; README actualizado |

Total ≈ 82,5 h. Para F5 en la estructura nueva alcanzan los pasos 0-6 (~43,5 h). Camino mínimo (sin pagar todo): `Waits` + `Gates` (parte del 1), `TripLifecyclePBO` (parte del 3) y paso 4 ≈ 20 h.

### Checklist de review por PR
- [ ] Capa correcta; sin imports prohibidos (2.2).
- [ ] Screen: solo locators + acciones atómicas; sin `pause`, `process.env` ni aserción de negocio.
- [ ] Locator en orden id/resource-id/clase/`aria-label` -> texto i18n; sin xpath con texto.
- [ ] Textos por `I18n.t`; sin literales ES/EN en screens/PBO.
- [ ] PBO devuelve tipo de dominio (no `string` crudo) y lanza errores tipados.
- [ ] Acciones irreversibles detrás de `Gates` y con `--dry-run` previo.
- [ ] Credenciales por nombre de clave; nunca valores ni impresas.
- [ ] Unit para lo puro (planes, parsers, i18n); fakes para PBO.
- [ ] No se repite un viaje real en TEST para validar un refactor: dry-run + unit; la corrida real la hace el orquestador.
- [ ] Commit con `[TC-ID]` si corresponde.

---

## 5. Riesgos
1. Textos reales de la app FR no verificados en este análisis (se asume `fr.json` en `magiis-mobile-driver-v2`): validar antes del paso 1.
2. El cierre por app es irreversible (viaje permanente en TEST): un refactor sin red de unit puede romper un gate; mitigación: `Gates` + `F5CloseTripPlan` intactos + baseline del dry-run.
3. Los selectores WebView dependen de clases Ionic (`btn.finish`, `app-travel-resume`): un cambio de front rompe todo; centralizarlos en `screens/` y guardar el DOM dump por release.
4. OneDrive rompe tsc/runner local: verificar en `C:/dev/wt`.
5. Sobre-abstracción: PBO solo con >= 2 consumidores reales (F5, cargo-decline, pax).
6. Dos fuentes del contrato con cv2-f5 (D13) hasta el paso 6.
