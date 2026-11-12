# Flow grabado — Setup del Driver para pruebas de push FCM

> Relevado en vivo el **2026-09-04** sobre dispositivo físico durante la campaña trifuerza de MG-862.
> Sirve como receta para automatizar el setup que **toda** prueba de push necesita, y que hoy es
> largo y frágil si se hace a ciegas.

## Por qué existe este documento

Dos descubrimientos hacen que este setup no sea trivial:

1. **Tras un borrado de datos, la app exige CINCO interacciones de permiso**, una de ellas saliendo
   a Ajustes del sistema. Un spec que asuma "instalo y logueo" se cuelga en el primer diálogo.
2. **~96 % de las cuentas del ambiente de test no tienen token FCM entregable** (tienen el centinela
   `INVALID_TOKEN` o `NULL`). Elegir una cuenta al azar garantiza que el push no llegue, y el spec
   fallaría por datos, no por producto.

## Entorno de referencia

| | |
|---|---|
| Dispositivo | Samsung SM-A055M · UDID `R92XB0B8F3J` · Android 15 / API 35 |
| Paquete | `com.magiis.app.test.driver` — **el `.test.` importa** |
| Build verificado | `MAGIIS test v2.6.15` (string visible en el menú lateral y en el login) |
| Cuenta | `DRIVER_EMAIL` / `DRIVER_PASSWORD` en `.env` (gitignoreado) |
| BD para asserts | MCP Oracle read-only, host `ip-10-20-0-129`, schema `MAGIIS` |

⚠️ **El equipo tiene 9 apps MAGIIS instaladas**, entre ellas `com.magiis.app.driver` y
`com.magiis.app.passenger` **sin prefijo de ambiente: son producción**. Cualquier automatización
debe fijar el paquete explícitamente y **nunca** resolverlo por nombre parcial.

⚠️ **Un solo dispositivo:** no abrir sesión Appium simultánea en driver y passenger.

## Precondiciones de datos (verificar por BD antes de correr, no asumir)

```sql
-- Token FCM del chofer. Debe dar TOKEN_REAL, no CENTINELA ni NULL.
SELECT n.ID                                   AS notif_id,
       CASE WHEN n.FIREBASETOKEN IS NULL            THEN 'NULL'
            WHEN n.FIREBASETOKEN = 'INVALID_TOKEN'  THEN 'CENTINELA'
            ELSE 'TOKEN_REAL' END              AS estado_token,
       n.PLATFORM,                                  -- 1 = Android
       d.APP_VERSION,
       d.INCOMING_TRAVEL_ID                         -- debe ser NULL: sin viaje pendiente
FROM   MAGIIS.DRIVER d
JOIN   MAGIIS.NOTIFICATIONINF n ON n.ID = d.NOTIFICATIONINF_ID
WHERE  d.ID = [driver_id]
```

Enlace de tablas: `DRIVER.USER_ID` → `MAGIISUSER.ID` (**no** es PK compartida).
Ojo: una persona tiene **dos** filas de token — la de `MAGIISUSER` y la de `DRIVER`. La app Driver
escribe sólo en la de `DRIVER`, vía `PUT /drivers/{id}/setFirebaseToken`.

## El flow, paso a paso

### 0. Sesión Appium

Modo local/embebido: `select_device` con `platform=android`, después
`appium_session_management action=create` con `{"appium:udid":"R92XB0B8F3J"}`.
**Nunca inventar una URL de localhost** — omitir `remoteServerUrl` ES el modo local.

Si `select_device` devuelve `device unauthorized`: falta aceptar el diálogo de depuración USB en el
teléfono. Confirmar con `adb devices -l` que aparece como `device` y no como `unauthorized`.

### 1. Audio — imprescindible si se verifica sonido

El equipo puede estar en modo silencio **con los volúmenes en un valor alto**: el modo de timbre
mutea los streams por encima del volumen guardado. Verificar el estado real, no el número:

```bash
adb shell dumpsys audio | grep -A3 "^- STREAM_NOTIFICATION"   # buscar "Muted: true"
adb shell dumpsys audio | grep -i "ringer mode muted streams"  # 0x0 = ninguno muteado
```

Para habilitarlo, y **guardar el valor previo para restaurarlo**:

```bash
adb shell cmd audio set-ringer-mode NORMAL
adb shell cmd audio set-volume 5 12          # stream 5 = NOTIFICATION, max 15
```

### 2. Los cinco permisos — atajo por adb

Concederlos por UI cuesta cinco diálogos, uno de ellos en Ajustes del sistema. Por adb es una línea:

```bash
PKG=com.magiis.app.test.driver
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS
adb shell pm grant $PKG android.permission.ACCESS_FINE_LOCATION
adb shell pm grant $PKG android.permission.ACCESS_COARSE_LOCATION
adb shell pm grant $PKG android.permission.ACCESS_BACKGROUND_LOCATION
adb shell pm grant $PKG android.permission.ACTIVITY_RECOGNITION
```

Verificación:

```bash
adb shell dumpsys package $PKG | grep -E "POST_NOTIFICATIONS|LOCATION|ACTIVITY_RECOGNITION" | grep granted
```

**El orden real que impone la UI** (útil si se quiere automatizar el camino humano, p. ej. para
cubrir TC033-TC037):

1. `POST_NOTIFICATIONS` — *"¿Permitir que Test Driver te envíe notificaciones?"*
   **Aparece en la pantalla de login, ANTES de autenticar.**
2. Ubicación en uso — *Precisa / Aproximada* + *Mientras la app está en uso*
3. `ACTIVITY_RECOGNITION` — *"¿acceda a tu actividad física?"* (lo pide el plugin de geolocalización)
4. Aviso propio de la app: *"A partir de este momento MAGIIS accederá a tu ubicación actualizada en
   todo momento"* → botón **Aceptar**
5. Diálogo propio de la app: *"¿Permitir a MAGIIS acceder a la localización en segundo plano?"* →
   **Cambiar a Permitir siempre**, que abre `ManagePermissionsActivity` del sistema

### 3. Login

La pantalla de login recuerda el email entre sesiones, pero **no** después de un borrado de datos.

Localizadores que funcionaron (la app es híbrida Cordova; las coordenadas son frágiles, preferir
estos):

| Elemento | Estrategia | Selector |
|---|---|---|
| Campo email | `xpath` | `(//android.widget.EditText)[1]` |
| Campo contraseña | `xpath` | `(//android.widget.EditText)[2]` |
| Botón Entrar | `-android uiautomator` | `new UiSelector().textContains("Entrar")` |

**Gotcha:** `appium_set_value` con `w3cActions=true` escribe en el elemento con foco. En el campo de
contraseña **no aterrizó** cuando se llegó por coordenadas; hubo que resolver el elemento con
`find_element` y pasarle el `elementUUID`. Para campos de password, usar siempre el UUID.

### 4. Disponibilidad

El toggle es el **círculo con el ícono de persona, arriba a la izquierda** del home. Alterna entre
`No Disponible` (contorno verde, relleno gris) y `Disponible` (relleno verde).
Una sesión nueva **siempre** arranca en `No Disponible`.

Aserción visual: el texto bajo el círculo cambia a `Disponible`.

### 5. Estado de la app antes de disparar el push

Para que el aviso se renderice en la **bandeja del sistema** y no dentro de la app:

```
appium_app_lifecycle action=background seconds=-1
appium_app_lifecycle action=query_state   → debe dar 3 (background)
```

Estados: `1` no corriendo · `3` background · `4` foreground.

### 6. Captura de evidencia de llegada

Tres señales independientes, en este orden de confiabilidad:

```bash
adb logcat -c                       # limpiar ANTES de disparar
adb logcat -v time > captura.txt    # dejar corriendo en background

# después del push:
adb shell dumpsys notification --noredact    # buscar NotificationRecord del paquete
```

En `dumpsys notification`, la sección **`PackagePreferences`** trae los canales; los avisos activos
están más arriba como `NotificationRecord(... pkg=<paquete> ... channel=<id> ...)`.

**Para enumerar canales de un paquete**, anclar en su `AppSettings` y no usar grep suelto — hay
decenas de paquetes y los bloques se encadenan:

```bash
grep -n "AppSettings: com.magiis.app.test.driver" dump.txt   # obtener la línea ancla
sed -n "<ancla>,\$p" dump.txt | grep -oE "mId='[^']*'" | head -6
```

## Canales de notificación relevados en este build

| Canal | Nombre | Importancia | Sonido |
|---|---|---|---|
| `NEW_TRAVEL` | Trip assigned | 4 | `android.resource://<pkg>/raw/claxon` |
| `CANCEL_TRAVEL` | Trip canceled | 4 | `android.resource://<pkg>/raw/cancel_travel` |
| `fcm_fallback_notification_channel` | Miscellaneous | 3 | sonido del sistema — lo crea el SDK de FCM |
| `com.ma…` (truncado) | TSLocationManager | 2 | `null` — servicio de geolocalización en primer plano |

**En 2.6.15 NO existen** los canales de sonido de MG-873 (`NEW_TRAVEL_CHIME`, `_DUP`,
`_GLOCKENSPIEL`, `_HOUSE`) ni el legacy `NEW_TRAVEL_SILENT`. Salieron en **v2.6.16**, así que
cualquier spec que los asuma necesita ese build como precondición declarada.

La app **PAX** no crea **ningún** canal: sus avisos usan el default del sistema.

## Hechos del ciclo de vida del token que un spec debe tener en cuenta

Medidos punto a punto en esta campaña:

```
login                        → ESCRIBE el token
logout (ruta manual)         → NO ESCRIBE NADA. el token queda vivo en la base
re-login misma instalación   → sobrescribe con el MISMO valor
borrado de datos + login     → sobrescribe con un valor NUEVO
```

**El ciclo es de sólo-escritura: la fila nunca vuelve a `NULL`.** Consecuencias prácticas:

- Un spec **no puede** usar "el token se limpió" como señal de logout. No se limpia.
- Para forzar un token **nuevo** hay que borrar los datos de la app; reinstalar o re-loguear no basta.
- Un token queda entregable **indefinidamente** hasta que otro login lo sobrescriba. Un spec que
  deje una cuenta deslogueada la deja con push activo.

## Higiene al terminar

1. Cancelar los viajes de prueba que hayan quedado abiertos.
2. Restaurar el modo de timbre y el volumen originales.
3. Dejar la app logueada si así estaba al empezar.
4. `appium_session_management action=delete` para cerrar la sesión del device.

## Pendientes de este relevamiento

- **Estado del chofer en BD:** no se ubicó la columna/tabla que persiste
  `OFFLINE/ONLINE/IN_TRAVEL`. `DRIVER` no la tiene. Candidatas sin verificar: `DRIVER_ACTIVITY`,
  `DRIVERSETTLPARAM`.
- **`DRIVER.LAST_SEE` quedó siempre en `NULL`**, incluso con la app abierta y el chofer disponible.
  No sirve como señal de actividad; averiguar quién debería escribirla.
- **Ruta de logout por 401**: no forzable sin invalidar la sesión del lado del servidor.
