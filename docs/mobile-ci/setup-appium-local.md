# Setup Appium local — Driver App Android

Guía paso a paso para ejecutar scripts de automatización Appium contra el dispositivo físico Samsung Galaxy A05.

---

## PARTE A — Configuración inicial (una sola vez)

Estos pasos solo se hacen la primera vez. Si ya los hiciste anteriormente, saltar a la Parte B.

### Paso A1 — Activar USB Debugging en el Samsung A05

En el teléfono:
```
Ajustes → Acerca del teléfono → Información de software
→ Tocar "Número de compilación" 7 veces seguidas
→ Aparece: "Eres desarrollador"

Ajustes → Opciones de desarrollador
→ Depuración USB → ON
```

### Paso A2 — Configurar variables de entorno

Abrir **PowerShell** (cualquier ventana) y ejecutar estos 4 comandos uno por uno:

```powershell
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "C:\Users\Erika\AppData\Local\Android\Sdk", "User")
```
```powershell
[System.Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", "C:\Users\Erika\AppData\Local\Android\Sdk", "User")
```
```powershell
[System.Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Android\Android Studio\jbr", "User")
```
```powershell
[System.Environment]::SetEnvironmentVariable("PATH", $env:PATH + ";C:\Users\Erika\AppData\Local\Android\Sdk\platform-tools", "User")
```

**Cerrar TODAS las terminales abiertas.** Las variables solo toman efecto en terminales nuevas.

---

## PARTE B — Arranque de cada sesión de trabajo

Estos pasos se repiten cada vez que querés ejecutar un script Appium.

### Paso B1 — Conectar el teléfono

Conectar el Samsung A05 por USB a la computadora.

Si aparece un popup en el teléfono "¿Permitir depuración USB?" → tocar **Permitir**.

### Paso B2 — Verificar que el teléfono está reconocido

Abrir una **PowerShell nueva** (Win + R → `powershell` → Enter) y ejecutar:

```powershell
adb devices
```

Resultado esperado:
```
List of devices attached
R92XB0B8F3J     device
```

- Si dice `unauthorized` → en el teléfono aceptar el popup "Permitir depuración USB"
- Si dice `offline` → desconectar y reconectar el cable USB
- Si está vacío → verificar que USB Debugging esté activado (Paso A1)
- Si `adb` no se reconoce → cerrar y reabrir la terminal (las vars del Paso A2 no cargaron)

### Paso B3 — Abrir Terminal 1: Appium Server

En la **misma PowerShell del paso B2** (o una nueva), ejecutar:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```
```powershell
npx appium --port 4723 --base-path /
```

Esperar hasta ver este mensaje:
```
[Appium] Appium REST http interface listener started on http://0.0.0.0:4723
```

**Dejar esta terminal abierta y corriendo.** No cerrarla.

### Paso B4 — Abrir Terminal 2: terminal del proyecto

Abrir la terminal integrada del IDE (VS Code: Ctrl + `) **o** una PowerShell nueva.

Navegar a la raíz del proyecto:
```powershell
cd "C:\Users\Erika\OneDrive - MAGIIS USA LLC (1)\Escritorio\magiis-playwright"
```

Habilitar ejecución de scripts:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

### Paso B5 — Preparar la app en el teléfono

Abrir la **Driver App TEST** en el teléfono y dejarla en la pantalla correcta según el script que se va a ejecutar (ver tabla de scripts más abajo).

### Paso B6 — Ejecutar el script

Desde la Terminal 2 (proyecto), correr el script deseado:

```powershell
npx ts-node --esm tests/mobile/appium/scripts/full-trip-flow-dump.ts
```

Ver la salida en consola y los archivos generados en `evidence/dom-dump/`.

---

## Scripts disponibles

| Script | Pantalla requerida en el teléfono | Qué hace |
|---|---|---|
| `full-trip-flow-dump.ts` | TravelConfirmPage (viaje llegando al driver) | Acepta viaje → empieza viaje → confirma modal → dumpea navegación |
| `accept-trip-and-dump.ts` | TravelConfirmPage | Solo acepta el viaje y dumpea |
| `start-trip-and-dump.ts` | TravelToStartPage (viaje ya aceptado) | Solo empieza el viaje y dumpea |
| `dump-current-screen.ts` | Cualquier pantalla | Dumpea lo que se ve en pantalla ahora mismo |
| `dump-after-login.ts` | Pantalla de login | Loguea y dumpea el home |

---

## Flujo de pantallas del viaje

```
Carrier crea viaje en portal web
          ↓
  TravelConfirmPage
  [Driver ve la solicitud]
  Tap "Aceptar"
          ↓
  TravelToStartPage
  [Driver ve detalle del viaje asignado]
  Tap "Empezar Viaje" → Modal "¿Desea empezar el Viaje?" → Tap "Si"
          ↓
  TravelNavigationPage          ← pendiente dump (objetivo actual)
  [Driver navega al pasajero]
  Tap "Finalizar Viaje"
          ↓
  Portal web → viaje CAPTURED
```

---

## Diagnóstico de errores comunes

| Error en consola | Causa | Solución |
|---|---|---|
| `adb: command not found` | platform-tools no está en PATH | Ejecutar Paso A2 y reabrir terminal |
| `Neither ANDROID_HOME nor ANDROID_SDK_ROOT` | Appium no ve las vars de entorno | Verificar Paso A2 y reabrir la terminal donde corre Appium |
| `npx.ps1 cannot be loaded` | Política de ejecución bloqueada | Ejecutar `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` |
| `⚠ Sin WebView` | La app no cargó el WebView | Esperar con la app en primer plano y reintentar |
| Popup "sesión expirada" en el teléfono | Bug del ambiente TEST | Tocar Aceptar en el popup e ingresar la contraseña manualmente |
| `Botón "Aceptar" no encontrado` | El viaje no está activo en pantalla | Verificar que el teléfono esté en TravelConfirmPage |
| `ECONNREFUSED 127.0.0.1:4723` | Appium Server no está corriendo | Ejecutar Paso B3 primero |

---

## Referencia del dispositivo

| Campo | Valor |
|---|---|
| Dispositivo | Samsung Galaxy A05 (SM-A055M) |
| UDID | `R92XB0B8F3J` |
| Package Driver App TEST | `com.magiis.app.test.driver` |
| Appium Server URL | `http://localhost:4723` |
| Driver de automatización | UiAutomator2 |
| Tecnología de la app | Ionic / Angular (WebView híbrido) |

---

## Dónde se guardan los resultados

```
evidence/
└── dom-dump/
    ├── 01-travel-confirm-{travelId}-{timestamp}.txt
    ├── 02-travel-to-start-{timestamp}.txt
    ├── 03-modal-before-confirm-{timestamp}.txt
    └── 04-travel-navigation-{timestamp}.txt
```

Los archivos `.txt` contienen el DOM completo de cada pantalla: URL actual, IDs, botones visibles y textos. Se usan para confirmar selectores antes de implementarlos en los Screen Objects.
