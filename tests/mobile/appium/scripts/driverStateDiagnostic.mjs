#!/usr/bin/env node
/**
 * driverStateDiagnostic.mjs
 *
 * Diagnostico y desbloqueo del dispositivo de QA para la app Driver.
 *
 * Motivo: al conectarse, la app muestra una fila de "viajes por conectar" que ya no
 * existen (fueron cancelados, finalizados o reasignados). Es un bloqueante para las
 * pruebas en dispositivo. Este script mide el estado real del equipo y de la app, deja
 * evidencia, y ofrece el desbloqueo.
 *
 * Uso:
 *   node tests/mobile/appium/scripts/driverStateDiagnostic.mjs                 # solo diagnostico
 *   node tests/mobile/appium/scripts/driverStateDiagnostic.mjs --logcat        # + captura logcat
 *   node tests/mobile/appium/scripts/driverStateDiagnostic.mjs --unblock       # + limpia datos de la app
 *   node tests/mobile/appium/scripts/driverStateDiagnostic.mjs --udid R92XB0B8F3J --package com.magiis.app.test.driver
 *
 * El modo por defecto NO modifica nada. `--unblock` borra los datos locales de la app
 * (equivale a "Borrar datos" en Ajustes) y exige volver a iniciar sesion.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ── Parametros ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const UDID = value('udid', process.env.ANDROID_DEVICE_UDID || 'R92XB0B8F3J');
const PKG = value('package', process.env.ANDROID_DRIVER_APP_PACKAGE || 'com.magiis.app.test.driver');
const APPIUM_URL = process.env.APPIUM_SERVER_URL || 'http://127.0.0.1:4723';
const OUT_DIR = value('out', join(process.cwd(), 'evidence', 'appium-diagnostic'));

const WEBVIEW = `/data/data/${PKG}/app_webview/Default`;

// ── Utilidades ───────────────────────────────────────────────────────────────
const ok = (m) => console.log(`  [OK]    ${m}`);
const warn = (m) => console.log(`  [AVISO] ${m}`);
const bad = (m) => console.log(`  [FALLA] ${m}`);
const title = (m) => console.log(`\n=== ${m} ===`);

const hallazgos = [];
const registrar = (nivel, mensaje) => {
  hallazgos.push({ nivel, mensaje });
  ({ ok, warn, bad }[nivel] ?? ok)(mensaje);
};

/** adb con captura de salida; nunca lanza, devuelve {code, out}. */
function adb(args, { timeout = 30_000 } = {}) {
  const r = spawnSync('adb', ['-s', UDID, ...args], {
    encoding: 'utf8',
    timeout,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  return { code: r.status ?? -1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

/** Ejecuta un comando dentro del sandbox de la app (requiere app debuggable). */
const runAs = (cmd, opts) => adb(['exec-out', `run-as ${PKG} ${cmd}`], opts);

const ts = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ── 1. Prerequisitos del entorno ─────────────────────────────────────────────
function verificarEntorno() {
  title('1. Entorno');

  const version = spawnSync('adb', ['version'], { encoding: 'utf8', windowsHide: true });
  if (version.status !== 0) {
    registrar('bad', 'adb no esta disponible en el PATH. Sin esto no se puede continuar.');
    return false;
  }
  ok(`adb disponible: ${(version.stdout || '').split('\n')[0].trim()}`);

  // Las variables de ${VAR} de .mcp.json se resuelven contra el entorno del SO,
  // NO contra el .env del repo. Un valor correcto en .env no alcanza.
  for (const v of ['APPIUM_ANDROID_HOME', 'APPIUM_CAPABILITIES_CONFIG', 'APPIUM_SCREENSHOTS_DIR']) {
    if (process.env[v]) ok(`${v} definida`);
    else registrar('warn', `${v} NO esta definida en el entorno del sistema operativo. El MCP de Appium va a fallar aunque el valor exista en .env.`);
  }

  const dispositivos = spawnSync('adb', ['devices', '-l'], { encoding: 'utf8', windowsHide: true });
  const lineas = (dispositivos.stdout || '').split('\n').slice(1).filter((l) => l.trim());
  const equipo = lineas.find((l) => l.startsWith(UDID));
  if (!equipo) {
    registrar('bad', `El dispositivo ${UDID} no aparece en adb devices. Conectado: ${lineas.map((l) => l.split(/\s+/)[0]).join(', ') || 'ninguno'}`);
    return false;
  }
  if (!/\bdevice\b/.test(equipo)) {
    registrar('bad', `El dispositivo ${UDID} figura como "${equipo.split(/\s+/)[1]}". Tiene que estar en estado "device".`);
    return false;
  }
  ok(`Dispositivo ${UDID} conectado y autorizado`);
  return true;
}

// ── 2. Servidor de Appium ────────────────────────────────────────────────────
async function verificarAppium() {
  title('2. Servidor de Appium');
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${APPIUM_URL}/status`, { signal: ctrl.signal });
    clearTimeout(t);
    const body = await res.json().catch(() => ({}));
    ok(`Appium responde en ${APPIUM_URL} (build ${body?.value?.build?.version ?? 'desconocido'})`);
    return true;
  } catch {
    registrar(
      'warn',
      `Appium NO responde en ${APPIUM_URL}. Los servidores MCP appium-mcp-driver y appium-mcp-passenger van a dar timeout al conectar. Levantalo con: appium --allow-cors`,
    );
    return false;
  }
}

// ── 3. Estado de la app ──────────────────────────────────────────────────────
function inspeccionarApp() {
  title('3. App Driver en el dispositivo');

  const paquetes = adb(['shell', 'pm', 'list', 'packages', PKG]);
  if (!paquetes.out.includes(PKG)) {
    registrar('bad', `El paquete ${PKG} no esta instalado en el dispositivo.`);
    return null;
  }
  ok(`Paquete instalado: ${PKG}`);

  const info = adb(['shell', 'dumpsys', 'package', PKG]);
  const campo = (re) => (info.out.match(re) || [, 'desconocido'])[1];
  const versionName = campo(/versionName=([^\s]+)/);
  const versionCode = campo(/versionCode=(\d+)/);
  const actualizado = campo(/lastUpdateTime=([^\n]+)/).trim();
  ok(`Version ${versionName} (build ${versionCode}), actualizada el ${actualizado}`);

  const prueba = runAs('ls');
  if (prueba.code !== 0) {
    registrar('warn', 'La app no permite run-as: no es debuggable. No se puede inspeccionar su almacenamiento local.');
    return { versionName, versionCode, debuggable: false };
  }
  ok('La app es debuggable: se puede inspeccionar su almacenamiento');
  return { versionName, versionCode, actualizado, debuggable: true };
}

// ── 4. Almacenamiento local: hay viajes cacheados? ───────────────────────────
function inspeccionarAlmacenamiento() {
  title('4. Almacenamiento local de la app');

  const claves = new Set();
  const fuentes = [
    { etiqueta: 'IndexedDB', ruta: `${WEBVIEW}/IndexedDB/https_localhost_0.indexeddb.leveldb` },
    { etiqueta: 'Local Storage', ruta: `${WEBVIEW}/Local Storage/leveldb` },
  ];

  for (const { etiqueta, ruta } of fuentes) {
    const listado = runAs(`ls '${ruta}'`);
    if (listado.code !== 0) {
      warn(`${etiqueta}: no accesible`);
      continue;
    }
    // `ls` del shell de Android devuelve los nombres separados por espacios en una
    // sola linea, no uno por linea: hay que partir por cualquier espacio en blanco.
    const archivos = listado.out.split(/\s+/).map((s) => s.trim()).filter((f) => /\.(log|ldb)$/.test(f));
    let bytes = 0;
    for (const archivo of archivos) {
      const contenido = adb(['exec-out', `run-as ${PKG} cat '${ruta}/${archivo}'`], { timeout: 60_000 });
      if (contenido.code !== 0) continue;
      bytes += contenido.out.length;
      // Chromium guarda las claves en UTF-16LE; el volcado por adb las trae mezcladas.
      for (const token of contenido.out.match(/[A-Za-z_][A-Za-z0-9_.\-]{3,45}/g) ?? []) claves.add(token);
    }
    ok(`${etiqueta}: ${archivos.length} archivos, ~${bytes} bytes leidos`);
  }

  const sospechosas = [...claves].filter((k) => /travel|viaje|captur|incom|pend|offer|trip/i.test(k)).sort();
  const estado = [...claves].filter((k) => /driverStat|driverSubStat|carrierUser|userI/i.test(k)).sort();

  if (estado.length) ok(`Estado del chofer persistido: ${estado.join(', ')}`);

  if (sospechosas.length) {
    registrar('warn', `Hay claves de viaje en el almacenamiento local: ${sospechosas.join(', ')}. Un viaje fantasma PODRIA venir de aca; "--unblock" lo resolveria.`);
  } else {
    registrar('ok', 'NO hay ninguna lista de viajes persistida en el dispositivo. Si la app muestra viajes que ya no existen, el dato NO viene del equipo: viene del backend o de Firebase en tiempo real.');
  }
  return { claves: [...claves].length, sospechosas, estado };
}

// ── 5. Estado del chofer en el servidor ──────────────────────────────────────
/**
 * OJO CON LO QUE MIDE ESTA SECCION.
 *
 * La fila de "viajes por conectar" NO se lee de la base: la app se suscribe al nodo de Firebase
 * RTDB `travel_notifications/{carrierId}/{driverId}` y publica todo lo que encuentre ahi, sin
 * validar contra el backend (magiis-mobile-driver-v2, travel.service.ts:3251). Ese nodo no tiene
 * expiracion ni reconciliacion, asi que un viaje muerto queda ofertandose para siempre.
 *
 * Lo que esta seccion mide son los DOS CAMPOS DE BASE adyacentes, que no causan las ofertas pero
 * si bloquean al chofer de otras formas y suelen estar sucios al mismo tiempo:
 *   - DRIVER.INCOMING_TRAVEL_ID       : referencia a la ultima oferta, nunca se limpia.
 *   - DRIVER_STATUS.TRAVEL_CAPTURE_ID : reserva de 2do viaje; si queda sucia, canBookTrip() falla
 *                                        y el chofer no recibe asignaciones manuales (MG-1159).
 * Medido en TEST el 2026-09-17: 18 choferes con INCOMING_TRAVEL_ID colgado, 11 apuntando a viajes
 * ya finalizados, el mas viejo de hace 1437 dias.
 *
 * Para confirmar o descartar el nodo de Firebase hace falta leer la RTDB, que este script todavia
 * no hace. Mientras tanto: si `--unblock` no limpia los viajes fantasma, la causa es el nodo.
 *
 * Es de SOLO LECTURA. Degrada a aviso si falta configuracion o no hay red: nunca frena el resto.
 */
async function verificarDatosBackend() {
  title('5. Estado del chofer en el servidor');

  const email = process.env.DRIVER_EMAIL;
  if (!email) {
    registrar('warn', 'DRIVER_EMAIL no esta definido: no se puede verificar el estado de los datos.');
    return null;
  }

  const sufijo = (process.env.ENV || process.env.TEST_ENV || 'test').toLowerCase() === 'uat' ? '' : '_TEST';
  const user = process.env[`ORACLE_USER${sufijo}`];
  const password = process.env[`ORACLE_PASSWORD${sufijo}`];
  const connectString =
    process.env[`ORACLE_CONNECT_STRING${sufijo}`] ||
    (process.env[`ORACLE_HOST${sufijo}`] && process.env[`ORACLE_PORT${sufijo}`] && process.env[`ORACLE_SERVICE${sufijo}`]
      ? `${process.env[`ORACLE_HOST${sufijo}`]}:${process.env[`ORACLE_PORT${sufijo}`]}/${process.env[`ORACLE_SERVICE${sufijo}`]}`
      : null);

  if (!user || !password || !connectString) {
    registrar('warn', `Sin credenciales de base (ORACLE_USER${sufijo} y compania): el estado de los datos queda SIN VERIFICAR.`);
    return null;
  }

  let oracledb;
  try {
    oracledb = (await import('oracledb')).default;
  } catch {
    registrar('warn', 'El paquete oracledb no esta disponible: el estado de los datos queda SIN VERIFICAR.');
    return null;
  }

  let conexion;
  try {
    conexion = await oracledb.getConnection({ user, password, connectString });
    const { rows } = await conexion.execute(
      `SELECT dr.ID, LPAD(dr.IDFORCARRIER,4,'0') AS CODIGO, dr.CARRIERACCOUNT_ID AS CARRIER,
              ds.DRIVER_STATUS, ds.OPERABILITY, ds.OUT_OF_SERVICE,
              dr.INCOMING_TRAVEL_ID AS OFERTA,
              CASE WHEN dr.INCOMING_TRAVEL_ID IS NULL THEN NULL
                   WHEN ofe.ID IS NULL THEN 'INEXISTENTE'
                   ELSE 'state=' || ofe.STATE END AS OFERTA_ESTADO,
              ROUND(SYSDATE - CAST(ofe.TRAVEL_DATE AS DATE), 1) AS OFERTA_DIAS,
              ds.TRAVEL_CAPTURE_ID AS RESERVA,
              CASE WHEN ds.TRAVEL_CAPTURE_ID IS NULL THEN NULL
                   WHEN cap.ID IS NULL THEN 'INEXISTENTE'
                   ELSE 'state=' || cap.STATE END AS RESERVA_ESTADO,
              (SELECT COUNT(*) FROM MAGIIS.TRAVEL t
                WHERE t.DRIVER_ID = dr.ID AND t.STATE NOT IN (6,10,11)) AS VIAJES_ABIERTOS
         FROM MAGIIS.DRIVER dr
         JOIN MAGIIS.MAGIISUSER u ON u.ID = dr.USER_ID
         LEFT JOIN MAGIIS.DRIVER_STATUS ds ON ds.DRIVER_ID = dr.ID
         LEFT JOIN MAGIIS.TRAVEL ofe ON ofe.ID = dr.INCOMING_TRAVEL_ID
         LEFT JOIN MAGIIS.TRAVEL cap ON cap.ID = ds.TRAVEL_CAPTURE_ID
        WHERE LOWER(u.EMAIL) = LOWER(:email)`,
      { email },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    if (!rows.length) {
      registrar('bad', `No existe ningun chofer con el email ${email}. Revisa DRIVER_EMAIL en el .env del ambiente.`);
      return null;
    }

    const d = rows[0];
    ok(`Chofer ${d.ID} · codigo ${d.CODIGO} · carrier ${d.CARRIER} · ${d.DRIVER_STATUS || 'sin estado'}`);

    if (d.OPERABILITY === 0) {
      registrar('bad', 'El chofer esta deshabilitado operativamente. Volve a tildar "Activo" en el ABM de choferes.');
    }
    if (d.OUT_OF_SERVICE === 1) registrar('warn', 'El chofer esta marcado como fuera de servicio.');

    // Estados cerrados: 6 finalizado, 10 y 11 cerrados. Mas de 2 horas ya no es una oferta viva.
    if (d.OFERTA !== null) {
      const cerrada = d.OFERTA_ESTADO === 'INEXISTENTE' || ['state=6', 'state=10', 'state=11'].includes(d.OFERTA_ESTADO);
      const vieja = (d.OFERTA_DIAS ?? 0) * 24 > 2;
      if (cerrada || vieja) {
        registrar(
          'bad',
          `REFERENCIA COLGADA: INCOMING_TRAVEL_ID=${d.OFERTA} (${d.OFERTA_ESTADO}` +
            `${d.OFERTA_DIAS !== null ? `, hace ${d.OFERTA_DIAS} dias` : ''}). No es la fuente de la fila de ofertas ` +
            '(esa vive en el nodo travel_notifications de Firebase), pero indica que este chofer arrastra estado sucio. ' +
            'Es un defecto de servidor: "--unblock" NO lo resuelve. Conviene usar otro chofer o pedir la limpieza.',
        );
      } else {
        registrar('warn', `Oferta reciente ${d.OFERTA} (${d.OFERTA_ESTADO}): puede ser legitima.`);
      }
    } else {
      ok('Sin ofertas entrantes colgadas.');
    }

    if (d.RESERVA !== null) {
      registrar(
        d.RESERVA_ESTADO === 'INEXISTENTE' ? 'bad' : 'warn',
        `Reserva colgada TRAVEL_CAPTURE_ID=${d.RESERVA} (${d.RESERVA_ESTADO}). Relacionado con MG-1159.`,
      );
    }

    if (d.VIAJES_ABIERTOS > 0) {
      registrar('warn', 
        `El chofer tiene ${d.VIAJES_ABIERTOS} viaje(s) sin cerrar: un chofer ocupado no recibe ofertas nuevas. ` +
          'Corre driver-free-stale-trip.ts para devolverlo a /navigator/home.',
      );
    }

    return d;
  } catch (e) {
    const msg = String(e?.message || e);
    if (/timed out|ENOTFOUND|ECONNREFUSED|NJS-510|transportConnectTimeout/i.test(msg)) {
      registrar('warn', 
        'No hay conectividad con la base desde esta maquina. El estado de los datos queda SIN VERIFICAR: ' +
          'el telefono puede estar bien y el chofer igual traer una oferta fantasma. Conectate a la VPN y repeti.',
      );
    } else {
      registrar('warn', `No se pudo consultar la base: ${msg}`);
    }
    return null;
  } finally {
    if (conexion) await conexion.close().catch(() => {});
  }
}

// ── 6. Evidencia ─────────────────────────────────────────────────────────────
function capturarEvidencia(conLogcat) {
  title('6. Evidencia');
  mkdirSync(OUT_DIR, { recursive: true });
  const marca = ts();
  const generados = [];

  const captura = join(OUT_DIR, `driver-${marca}.png`);
  const png = spawnSync('adb', ['-s', UDID, 'exec-out', 'screencap', '-p'], {
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (png.status === 0 && png.stdout?.length) {
    writeFileSync(captura, png.stdout);
    ok(`Captura de pantalla: ${captura}`);
    generados.push(captura);
  } else {
    warn('No se pudo tomar la captura de pantalla');
  }

  if (conLogcat) {
    const log = join(OUT_DIR, `logcat-${marca}.txt`);
    const r = adb(['logcat', '-d', '-v', 'time'], { timeout: 60_000 });
    const filtrado = r.out
      .split('\n')
      .filter((l) => /magiis|chromium|capacitor|firebase|travel/i.test(l))
      .slice(-800)
      .join('\n');
    writeFileSync(log, filtrado || r.out.slice(-200_000), 'utf8');
    ok(`Logcat filtrado: ${log}`);
    generados.push(log);
  }
  return generados;
}

// ── 7. Desbloqueo ────────────────────────────────────────────────────────────
function desbloquear() {
  title('7. Desbloqueo');
  warn(`Se van a BORRAR los datos locales de ${PKG}. Va a hacer falta iniciar sesion de nuevo en la app.`);
  const r = adb(['shell', 'pm', 'clear', PKG], { timeout: 60_000 });
  if (r.code === 0 && /Success/i.test(r.out)) {
    ok('Datos de la app borrados. Abri la app e inicia sesion para verificar si los viajes fantasma desaparecieron.');
    ok('Si los viajes fantasma SIGUEN apareciendo despues de esto, queda demostrado que el dato viene del servidor y no del dispositivo.');
    return true;
  }
  bad(`No se pudieron borrar los datos: ${r.out || 'sin salida'}`);
  return false;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  // Este script se invoca con `node` directo, sin el ts-node que carga dotenv en el resto de
  // la capa. Sin esto, DRIVER_EMAIL y las credenciales de Oracle llegan vacias y la seccion 5
  // se saltea en silencio, que es peor que fallar.
  try {
    const dotenv = (await import('dotenv')).default;
    const archivo = process.env.ENV_FILE || `.env.${(process.env.ENV || 'test').toLowerCase()}`;
    if (existsSync(archivo)) dotenv.config({ path: archivo, override: false, quiet: true });
  } catch {
    /* sin dotenv el script sigue: solo se pierde la seccion de datos */
  }

  console.log('Diagnostico del dispositivo de QA — app Driver');
  console.log(`Dispositivo ${UDID} · paquete ${PKG}`);

  if (!verificarEntorno()) {
    console.log('\nNo se puede continuar sin un dispositivo conectado.');
    process.exit(2);
  }

  await verificarAppium();
  const app = inspeccionarApp();
  const almacenamiento = app?.debuggable ? inspeccionarAlmacenamiento() : null;
  const backend = await verificarDatosBackend();
  const evidencia = capturarEvidencia(flag('logcat'));
  if (flag('unblock')) desbloquear();

  title('Resumen');
  const fallas = hallazgos.filter((h) => h.nivel === 'bad');
  const avisos = hallazgos.filter((h) => h.nivel === 'warn');
  console.log(`  ${fallas.length} fallas · ${avisos.length} avisos`);
  for (const h of [...fallas, ...avisos]) console.log(`  - [${h.nivel.toUpperCase()}] ${h.mensaje}`);

  const reporte = join(OUT_DIR, `diagnostico-${ts()}.json`);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    reporte,
    JSON.stringify({ fecha: new Date().toISOString(), udid: UDID, paquete: PKG, app, almacenamiento, backend, evidencia, hallazgos }, null, 2),
    'utf8',
  );
  console.log(`\n  Reporte: ${reporte}`);

  if (!flag('unblock') && almacenamiento) {
    console.log('\n  Para borrar los datos de la app y salir del bloqueo, volve a correr con --unblock');
  }
  process.exit(fallas.length ? 1 : 0);
})();
