/**
 * driver-ghost-trips-purge
 * ========================
 * DESBLOQUEO de QA móvil: limpia los "viajes fantasma" de la home del conductor SIN tocar
 * Firebase ni la base a mano.
 *
 * Complementa a `driver-ghost-trips-audit.ts` (que solo detecta y corta la corrida). Este
 * script hace lo que la auditoría no puede: dejar la home limpia para que el smoke arranque.
 *
 * Causa raíz (leída en magiis-be@develop y magiis-mobile-driver-v2@develop, 2026-09-17):
 *   - La home del conductor se pinta EXCLUSIVAMENTE desde el nodo de Firebase RTDB
 *     `travel_notifications/{carrierId}/{driverId}/{travelId}` (`travel.service.ts:3249`).
 *     La app no valida contra el backend: si el nodo existe, la card se dibuja.
 *   - Las vías masivas que matan viajes (job `AutomaticFinalizeTravelCron` → bulk UPDATE a LOST,
 *     hard-deletes de recurrentes/ODN) NUNCA borran ese nodo. Queda huérfano para siempre.
 *   - `POST carriers/{carrierId}/travels/{travelId}/refuse` responde 404 `TRAVEL_NOT_FOUND`
 *     cuando el viaje ya no está en `MAGIIS.TRAVEL`, PERO su `catch`
 *     (`TravelController.java` ~1599-1606) llama `deleteRTDAssignedTravel(carrier, driver, travelId)`:
 *     el backend borra el nodo colgado como reacción al error.
 *
 * Mecanismo de la purga: invocar `refuse` por cada código fantasma. El 404 es el resultado
 * ESPERADO; el efecto útil es el borrado del nodo, que el listener de Firebase de la app
 * refleja en vivo. Solo se purgan códigos que NO existen en `MAGIIS.TRAVEL` (ARCHIVADO o
 * INEXISTENTE): un viaje vivo o finalizado que sí esté en la tabla pasaría por la lógica real
 * de rechazo y podría tener efectos sobre un viaje de verdad, así que nunca se toca.
 *
 * Qué hace:
 *   1. Abre sesión con la app driver. Si el conductor quedó varado en una pantalla de viaje
 *      (TravelConfirm/ToStart/InProgress/Resume) lo devuelve a la home con
 *      `recoverDriverToHome` (misma máquina de estados que usa el pre-warm de las corridas).
 *   2. Lee del WebView los códigos de viaje visibles (mismo patrón que la auditoría) y, del
 *      storage de la app (Ionic Storage → IndexedDB `_ionicstorage/_ionickv`), el token JWT,
 *      el `userId` (= DRIVER.ID) y el `carrierUserId`. Sin login por API: la app ya está logueada.
 *   3. Resuelve cada código contra Oracle: si está en TRAVEL no se toca; si solo está en
 *      TRAVEL_HISTORY o en ninguna, es fantasma y se toma su ID real de TRAVEL_HISTORY.
 *   4. Por cada fantasma con ID resuelto hace el POST refuse con el token del dispositivo.
 *   5. Vuelve a leer la home y reporta qué códigos desaparecieron. Guarda JSON + capturas.
 *   6. Exit 0 si la home quedó limpia; exit 1 si quedó algún fantasma (o si es dry-run con
 *      fantasmas, para que la corrida no arranque sobre una home sucia).
 *
 * Por defecto es DRY-RUN: lista qué purgaría y no llama a nada. Para aplicar:
 *   GHOST_PURGE_APPLY=1
 *
 * Uso:
 *   APPIUM_SERVER_URL=http://localhost:4723 ANDROID_UDID=<udid> ENV=test \
 *   ANDROID_DRIVER_APP_PACKAGE=com.magiis.app.test.driver GHOST_PURGE_APPLY=1 \
 *   DOTENV_CONFIG_PATH=.env.test npx tsx -r dotenv/config \
 *     tests/mobile/appium/scripts/driver-ghost-trips-purge.ts
 *
 * Variables opcionales:
 *   GHOST_PURGE_APPLY        '1' para ejecutar los refuse (default: dry-run)
 *   GHOST_PURGE_CARRIER_ID   carrier a consultar en Oracle (default 1040)
 *   GHOST_PURGE_API_URL      base de la API (default https://apps-test.magiis.com/magiis-v0.2/)
 *   GHOST_PURGE_OUT_DIR      carpeta de salida (default evidence/<env>/ghost-trips)
 *   GHOST_PURGE_SETTLE_MS    espera tras los refuse antes de releer la home (default 4000)
 *
 * Límite conocido: si el nodo huérfano pertenece a OTRO driverId (el nodo se indexa por
 * conductor), el refuse con el driver logueado no lo alcanza. En ese caso el reporte lo
 * muestra como "persistente" y hay que escalar al dev con el travelId.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { getDriverAppConfig } from '../config/appiumRuntime';
import { DriverHomeScreen } from '../driver/DriverHomeScreen';
import { recoverDriverToHome, DRIVER_HOME_ROUTE_PATTERN } from '../helpers/driverStaleTripRecovery';
import { OracleDb } from '../../../components/db/OracleDb';

const log = (m: string): void => console.log(`[ghost-purge] ${m}`);

const APPLY = process.env.GHOST_PURGE_APPLY === '1';
const CARRIER_ID = Number(process.env.GHOST_PURGE_CARRIER_ID ?? 1040);
const API_URL = (process.env.GHOST_PURGE_API_URL ?? 'https://apps-test.magiis.com/magiis-v0.2/').replace(/\/?$/, '/');
const SETTLE_MS = Number(process.env.GHOST_PURGE_SETTLE_MS ?? 4000);
const OUT_DIR =
  process.env.GHOST_PURGE_OUT_DIR ?? join('evidence', process.env.ENV ?? 'test', 'ghost-trips');

/** Ordinales de `TravelState` en magiis-be (`Travel.java` persiste el enum por posición). */
const TRAVEL_STATE = [
  'SEARCHING_DRIVER',
  'WITH_DRIVER_ASSIGNED',
  'GOING_TO_CLIENT',
  'GOING_TO_DESTINATION',
  'CLOSING_TRAVEL',
  'RESERVED',
  'DONE',
  'CANCELLED',
  'LOST',
  'SCHEDULED',
  'NO_AUTH',
  'NO_PAY',
] as const;
const nombreEstado = (n: number | null): string =>
  n === null || n === undefined ? '—' : (TRAVEL_STATE[n] ?? `DESCONOCIDO(${n})`);

type Seccion = 'asignado' | 'disponible' | 'indeterminada';

interface CodigoEnPantalla {
  codigo: string;
  idForCarrier: number;
  seccion: Seccion;
}

interface Resolucion extends CodigoEnPantalla {
  enTravel: boolean;
  travelId: number | null;
  estado: string;
  fechaViaje: string | null;
  esFantasma: boolean;
  motivoNoPurga: string | null;
}

interface ResultadoRefuse {
  codigo: string;
  travelId: number;
  status: number | null;
  errorCode: string | null;
  detalle: string;
}

interface StorageApp {
  tokenUserLogged: string | null;
  userId: string | null;
  carrierUserId: string | null;
  fuente: 'indexeddb' | 'localstorage' | 'ninguna';
}

/**
 * Expone en el script los helpers de WebView que la base declara `protected`.
 * No agrega comportamiento: solo cambia la visibilidad.
 */
class GhostTripPurgeScreen extends DriverHomeScreen {
  driverActual() {
    return this.requireDriver();
  }

  async irAWebView(): Promise<string | null> {
    return this.switchToWebView();
  }

  async urlActual(): Promise<string> {
    return this.executeInWebView(() => window.location.href);
  }

  /** Misma extracción que `driver-ghost-trips-audit.ts`: códigos "NNNNN-X" y su sección. */
  async leerCodigosDeViaje(): Promise<CodigoEnPantalla[]> {
    const crudos = await this.executeInWebView(() => {
      const PATRON = /\b(\d{4,5})-([A-Z]{1,2})\b/g;
      const salida: { codigo: string; idForCarrier: number; seccion: string }[] = [];
      const vistos = new Set<string>();
      const textoDe = (el: Element): string => (el.textContent ?? '').trim();
      const nodos = Array.from(document.querySelectorAll('body *')).filter(
        (el) => el.children.length === 0 && textoDe(el).length > 0,
      );
      let seccionActual = 'indeterminada';
      for (const el of nodos) {
        const t = textoDe(el);
        if (/assigned\s+trip|viaje\s+asignado/i.test(t)) {
          seccionActual = 'asignado';
          continue;
        }
        if (/available\s+trips?|viajes?\s+disponibles?/i.test(t)) {
          seccionActual = 'disponible';
          continue;
        }
        PATRON.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = PATRON.exec(t)) !== null) {
          if (vistos.has(m[0])) continue;
          vistos.add(m[0]);
          salida.push({ codigo: m[0], idForCarrier: Number(m[1]), seccion: seccionActual });
        }
      }
      return salida;
    });

    return (crudos as CodigoEnPantalla[]).map((c) => ({
      ...c,
      seccion: (['asignado', 'disponible'].includes(c.seccion as string)
        ? c.seccion
        : 'indeterminada') as Seccion,
    }));
  }

  /**
   * Lee token / userId / carrierUserId del storage de la app.
   *
   * Ionic Storage (`IonicStorageModule.forRoot()` sin driver sqlite) persiste en IndexedDB,
   * base `_ionicstorage`, store `_ionickv`, con fallback a localStorage bajo la clave
   * `_ionicstorage/_ionickv/<key>`. IndexedDB es asíncrono y `executeInWebView` es sincrónico,
   * así que se hace en dos fases: una llamada dispara la lectura y deja el resultado en
   * `window.__qaGhostPurgeStorage`; las siguientes lo recogen por polling.
   */
  async leerStorageApp(timeoutMs = 8000): Promise<StorageApp> {
    await this.executeInWebView(() => {
      const w = window as unknown as { __qaGhostPurgeStorage?: unknown };
      w.__qaGhostPurgeStorage = undefined;
      const claves = ['tokenUserLogged', 'userId', 'carrierUserId'];
      const salida: Record<string, unknown> = { fuente: 'indexeddb' };
      try {
        const req = indexedDB.open('_ionicstorage');
        req.onerror = () => {
          w.__qaGhostPurgeStorage = { error: 'indexeddb-open' };
        };
        req.onsuccess = () => {
          try {
            const db = req.result;
            const tx = db.transaction('_ionickv', 'readonly');
            const store = tx.objectStore('_ionickv');
            let pendientes = claves.length;
            claves.forEach((k) => {
              const g = store.get(k);
              g.onsuccess = () => {
                salida[k] = g.result ?? null;
                if (--pendientes === 0) w.__qaGhostPurgeStorage = salida;
              };
              g.onerror = () => {
                salida[k] = null;
                if (--pendientes === 0) w.__qaGhostPurgeStorage = salida;
              };
            });
          } catch (e) {
            w.__qaGhostPurgeStorage = { error: 'indexeddb-tx:' + String(e) };
          }
        };
      } catch (e) {
        w.__qaGhostPurgeStorage = { error: 'indexeddb:' + String(e) };
      }
    });

    const inicio = Date.now();
    let resultado: Record<string, unknown> | undefined;
    while (Date.now() - inicio < timeoutMs) {
      resultado = await this.executeInWebView(
        () => (window as unknown as { __qaGhostPurgeStorage?: Record<string, unknown> }).__qaGhostPurgeStorage,
      );
      if (resultado) break;
      await this.pause(250);
    }

    if (resultado && !resultado.error && resultado.tokenUserLogged) {
      return {
        tokenUserLogged: String(resultado.tokenUserLogged),
        userId: resultado.userId == null ? null : String(resultado.userId),
        carrierUserId: resultado.carrierUserId == null ? null : String(resultado.carrierUserId),
        fuente: 'indexeddb',
      };
    }

    // Fallback: driver localStorage de localforage (`<db>/<store>/<key>`, valores serializados).
    const ls = await this.executeInWebView(() => {
      const leer = (k: string): string | null => {
        const raw = window.localStorage.getItem(`_ionicstorage/_ionickv/${k}`);
        if (raw == null) return null;
        try {
          const v = JSON.parse(raw);
          return v == null ? null : String(v);
        } catch {
          return raw;
        }
      };
      return {
        tokenUserLogged: leer('tokenUserLogged'),
        userId: leer('userId'),
        carrierUserId: leer('carrierUserId'),
      };
    });

    if (ls.tokenUserLogged) return { ...ls, fuente: 'localstorage' };
    return { tokenUserLogged: null, userId: null, carrierUserId: null, fuente: 'ninguna' };
  }

  async capturar(ruta: string): Promise<void> {
    const png = await this.requireDriver().takeScreenshot();
    writeFileSync(ruta, Buffer.from(png, 'base64'));
  }

  /** `pause` es protected en la base; el flujo principal vive fuera de la clase. */
  async esperar(ms: number): Promise<void> {
    await this.pause(ms);
  }
}

async function resolverContraOracle(codigos: CodigoEnPantalla[]): Promise<Resolucion[]> {
  if (codigos.length === 0) return [];
  const db = new OracleDb();
  const binds: Record<string, unknown> = { carrier: CARRIER_ID };
  const placeholders = codigos.map((c, i) => {
    binds[`id${i}`] = c.idForCarrier;
    return `:id${i}`;
  });

  type Fila = { ID: number; IDFORCARRIER: number; STATE: number; FECHA: string | null };
  const vivos = await db.query<Fila>(
    `SELECT t.ID, t.IDFORCARRIER, t.STATE, TO_CHAR(t.TRAVEL_DATE, 'YYYY-MM-DD HH24:MI') AS FECHA
       FROM MAGIIS.TRAVEL t
      WHERE t.CARRIERACCOUNT_ID = :carrier AND t.IDFORCARRIER IN (${placeholders.join(', ')})`,
    binds,
  );
  const archivados = await db.query<Fila>(
    `SELECT th.ID, th.IDFORCARRIER, th.STATE, TO_CHAR(th.TRAVEL_DATE, 'YYYY-MM-DD HH24:MI') AS FECHA
       FROM MAGIIS.TRAVEL_HISTORY th
      WHERE th.CARRIERACCOUNT_ID = :carrier AND th.IDFORCARRIER IN (${placeholders.join(', ')})`,
    binds,
  );

  const porCodigo = (filas: Fila[]): Map<number, Fila> => new Map(filas.map((f) => [Number(f.IDFORCARRIER), f]));
  const mapaVivos = porCodigo(vivos);
  const mapaArchivados = porCodigo(archivados);

  return codigos.map((c) => {
    const vivo = mapaVivos.get(c.idForCarrier);
    const archivado = mapaArchivados.get(c.idForCarrier);
    if (vivo) {
      return {
        ...c,
        enTravel: true,
        travelId: Number(vivo.ID),
        estado: nombreEstado(Number(vivo.STATE)),
        fechaViaje: vivo.FECHA,
        esFantasma: false,
        motivoNoPurga: 'existe en TRAVEL: nunca se purga por refuse, sería tocar un viaje real',
      };
    }
    if (archivado) {
      return {
        ...c,
        enTravel: false,
        travelId: Number(archivado.ID),
        estado: nombreEstado(Number(archivado.STATE)),
        fechaViaje: archivado.FECHA,
        esFantasma: true,
        motivoNoPurga: null,
      };
    }
    return {
      ...c,
      enTravel: false,
      travelId: null,
      estado: '—',
      fechaViaje: null,
      esFantasma: true,
      motivoNoPurga: 'no está ni en TRAVEL ni en TRAVEL_HISTORY: sin travelId no hay nodo que borrar',
    };
  });
}

async function refuse(
  r: Resolucion,
  storage: StorageApp,
): Promise<ResultadoRefuse> {
  const url = `${API_URL}carriers/${storage.carrierUserId}/travels/${r.travelId}/refuse`;
  const body = {
    travelId: r.travelId,
    carrierUserId: Number(storage.carrierUserId),
    driverUserId: Number(storage.userId),
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${storage.tokenUserLogged}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const texto = await res.text();
    let errorCode: string | null = null;
    try {
      const j = JSON.parse(texto) as { errorCode?: string; systemError?: string };
      errorCode = j.errorCode ?? j.systemError ?? null;
    } catch {
      /* body no JSON */
    }
    const detalle =
      res.status === 404
        ? 'esperado: viaje inexistente, el backend borra el nodo en el catch'
        : res.status === 200
          ? 'inesperado: el viaje existía y se rechazó de verdad'
          : `respuesta no prevista: ${texto.slice(0, 160)}`;
    return { codigo: r.codigo, travelId: r.travelId as number, status: res.status, errorCode, detalle };
  } catch (e) {
    return { codigo: r.codigo, travelId: r.travelId as number, status: null, errorCode: null, detalle: String(e) };
  }
}

function imprimir(res: Resolucion[]): void {
  const w = Math.max(9, ...res.map((r) => r.codigo.length));
  const fila = (a: string, b: string, c: string, d: string, e: string): string =>
    `  ${a.padEnd(w)}  ${b.padEnd(13)}  ${c.padEnd(9)}  ${d.padEnd(20)}  ${e}`;
  log('');
  log(fila('CÓDIGO', 'SECCIÓN', 'TRAVEL_ID', 'ESTADO', 'ACCIÓN'));
  log(fila('-'.repeat(w), '-'.repeat(13), '-'.repeat(9), '-'.repeat(20), '-'.repeat(30)));
  for (const r of res) {
    const accion = !r.esFantasma
      ? 'se conserva (vivo)'
      : r.travelId === null
        ? 'sin travelId, escalar'
        : APPLY
          ? 'PURGAR via refuse'
          : 'purgaría (dry-run)';
    log(fila(r.codigo, r.seccion, r.travelId === null ? '—' : String(r.travelId), r.estado, accion));
  }
  log('');
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const marca = new Date().toISOString().replace(/[:.]/g, '-');
  const pantalla = new GhostTripPurgeScreen(getDriverAppConfig());

  let resolucion: Resolucion[] = [];
  let refuses: ResultadoRefuse[] = [];
  let despues: CodigoEnPantalla[] = [];
  let storage: StorageApp = { tokenUserLogged: null, userId: null, carrierUserId: null, fuente: 'ninguna' };

  try {
    log(`modo: ${APPLY ? 'APLICAR (GHOST_PURGE_APPLY=1)' : 'DRY-RUN (sin llamadas al backend)'}`);
    log('abriendo sesión con la app driver…');
    await pantalla.startSession();
    await pantalla.dismissPreHomeOverlayIfPresent();

    const contexto = await pantalla.irAWebView();
    if (!contexto) throw new Error('No se pudo cambiar al WebView de la app driver.');

    // Conductor varado en una pantalla de viaje: primero volver a la home.
    const url = await pantalla.urlActual();
    if (!DRIVER_HOME_ROUTE_PATTERN.test(url)) {
      log(`la app no está en la home (${url}); recuperando al conductor…`);
      const rec = await recoverDriverToHome(pantalla.driverActual(), { log });
      log(`recuperación: ${rec.freed ? 'OK' : 'NO'} — ${rec.actions?.join(' → ') ?? ''}`);
      await pantalla.irAWebView();
    }

    await pantalla.capturar(join(OUT_DIR, `purge-antes-${marca}.png`));

    const codigos = await pantalla.leerCodigosDeViaje();
    log(`códigos visibles en la home: ${codigos.length || 'ninguno'}`);
    if (codigos.length === 0) {
      log('la home está limpia. Nada que purgar.');
      return;
    }

    resolucion = await resolverContraOracle(codigos);
    imprimir(resolucion);

    const purgables = resolucion.filter((r) => r.esFantasma && r.travelId !== null);
    if (purgables.length === 0) {
      log('no hay fantasmas con travelId resoluble. Nada que purgar.');
      return;
    }

    storage = await pantalla.leerStorageApp();
    log(`storage de la app (${storage.fuente}): userId=${storage.userId} carrierUserId=${storage.carrierUserId} token=${storage.tokenUserLogged ? 'presente' : 'AUSENTE'}`);
    if (!storage.tokenUserLogged || !storage.userId || !storage.carrierUserId) {
      throw new Error('No se pudo leer token/userId/carrierUserId del storage de la app: sin eso no hay refuse posible.');
    }
    if (String(storage.carrierUserId) !== String(CARRIER_ID)) {
      log(`AVISO: el carrier del dispositivo (${storage.carrierUserId}) no coincide con GHOST_PURGE_CARRIER_ID (${CARRIER_ID}). Se usa el del dispositivo para el refuse.`);
    }

    if (!APPLY) {
      log(`dry-run: ${purgables.length} refuse(s) NO ejecutados. Repetir con GHOST_PURGE_APPLY=1 para aplicar.`);
      return;
    }

    for (const r of purgables) {
      const res = await refuse(r, storage);
      refuses.push(res);
      log(`refuse ${r.codigo} (travelId ${r.travelId}) → HTTP ${res.status ?? 'sin respuesta'} ${res.errorCode ?? ''} · ${res.detalle}`);
    }

    log(`esperando ${SETTLE_MS} ms a que Firebase refresque la home…`);
    await pantalla.esperar(SETTLE_MS);
    await pantalla.irAWebView();
    despues = await pantalla.leerCodigosDeViaje();
    await pantalla.capturar(join(OUT_DIR, `purge-despues-${marca}.png`));
  } finally {
    await pantalla.endSession().catch(() => undefined);
  }

  const purgados = refuses.map((r) => r.codigo);
  const persistentes = despues.filter((c) => purgados.includes(c.codigo)).map((c) => c.codigo);
  const reporte = {
    generado: new Date().toISOString(),
    ambiente: process.env.ENV ?? 'test',
    modo: APPLY ? 'apply' : 'dry-run',
    carrierId: CARRIER_ID,
    dispositivo: { userId: storage.userId, carrierUserId: storage.carrierUserId, fuenteStorage: storage.fuente },
    antes: resolucion,
    refuses,
    despues,
    persistentes,
  };
  const rutaJson = join(OUT_DIR, `ghost-purge-${marca}.json`);
  writeFileSync(rutaJson, JSON.stringify(reporte, null, 2), 'utf-8');
  log(`reporte: ${rutaJson}`);

  if (!APPLY) {
    process.exitCode = 1;
    return;
  }
  if (persistentes.length === 0) {
    log(`OK — ${purgados.length} fantasma(s) purgados; la home quedó limpia.`);
    return;
  }
  log(`ATENCIÓN — ${persistentes.length} código(s) siguen en la home tras el refuse: ${persistentes.join(', ')}.`);
  log('Probable nodo indexado bajo otro driverId, o el catch del backend no lo alcanzó. Escalar al dev con los travelId del reporte.');
  process.exitCode = 1;
}

main().catch((e) => {
  log(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
