/**
 * driver-ghost-trips-audit
 * ========================
 * GATE BLOQUEANTE de QA móvil: detecta "viajes fantasma" en la home del conductor.
 *
 * El problema que resuelve (MEDIDO en TEST el 2026-09-17, carrier 1040, driver 2646):
 * la app muestra un "Assigned Trip" y una lista de "Available Trips" con códigos que
 * YA NO EXISTEN en la tabla viva `MAGIIS.TRAVEL`. Los seis códigos observados
 * (15146, 15147, 15148, 14335, 14550, 15174) están en `MAGIIS.TRAVEL_HISTORY` con
 * `STATE = 8` (LOST) y `DRIVER_ID = null`, con fechas de viaje de junio y agosto de 2026.
 * Al mismo tiempo `DRIVER_STATUS` del conductor tiene `TRAVEL_ID = null` y
 * `TRAVEL_CAPTURE_ID = null`: la base dice que no tiene nada y la app ofrece seis.
 *
 * Por qué es bloqueante: cualquier caso que arranque tocando una de esas cards falla por
 * un motivo que no es el que se está probando. Antes de culpar al build hay que saber si
 * el dispositivo arranca de un estado limpio.
 *
 * Qué hace:
 *   1. Abre sesión con la app driver y llega a la home.
 *   2. Lee del WebView TODOS los códigos de viaje visibles y su sección
 *      (asignado / disponible).
 *   3. Consulta Oracle por cada código y lo clasifica:
 *        VIVO        → existe en TRAVEL y su estado es activo
 *        FINALIZADO  → existe en TRAVEL pero en estado final (DONE/CANCELLED/LOST)
 *        ARCHIVADO   → NO está en TRAVEL, sí en TRAVEL_HISTORY  ← el caso fantasma
 *        INEXISTENTE → no aparece en ninguna de las dos
 *   4. Imprime la tabla, guarda un JSON y una captura.
 *   5. Sale con código 1 si encontró al menos un fantasma, para cortar la corrida.
 *
 * Uso:
 *   APPIUM_SERVER_URL=http://localhost:4723 ANDROID_UDID=<udid> ENV=test \
 *   ANDROID_DRIVER_APP_PACKAGE=com.magiis.app.test.driver \
 *   DOTENV_CONFIG_PATH=.env.test npx tsx -r dotenv/config \
 *     tests/mobile/appium/scripts/driver-ghost-trips-audit.ts
 *
 * Variables opcionales:
 *   GHOST_AUDIT_CARRIER_ID   carrier a consultar (default 1040)
 *   GHOST_AUDIT_OUT_DIR      carpeta de salida (default evidence/<env>/ghost-trips)
 *   GHOST_AUDIT_SOFT         '1' para reportar sin cortar (exit 0 aunque haya fantasmas)
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { getDriverAppConfig } from '../config/appiumRuntime';
import { DriverHomeScreen } from '../driver/DriverHomeScreen';
import { OracleDb } from '../../../components/db/OracleDb';

const log = (m: string): void => console.log(`[ghost-audit] ${m}`);

const CARRIER_ID = Number(process.env.GHOST_AUDIT_CARRIER_ID ?? 1040);
const SOFT = process.env.GHOST_AUDIT_SOFT === '1';
const OUT_DIR =
  process.env.GHOST_AUDIT_OUT_DIR ?? join('evidence', process.env.ENV ?? 'test', 'ghost-trips');

/** Ordinales de `TravelState` en magiis-be (el enum se persiste por posición). */
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

const ESTADOS_FINALES = new Set(['DONE', 'CANCELLED', 'LOST']);

const nombreEstado = (n: number | null): string =>
  n === null || n === undefined ? '—' : (TRAVEL_STATE[n] ?? `DESCONOCIDO(${n})`);

type Seccion = 'asignado' | 'disponible' | 'indeterminada';
type Clasificacion = 'VIVO' | 'FINALIZADO' | 'ARCHIVADO' | 'INEXISTENTE';

interface CodigoEnPantalla {
  codigo: string;
  idForCarrier: number;
  seccion: Seccion;
}

interface Hallazgo extends CodigoEnPantalla {
  clasificacion: Clasificacion;
  estado: string;
  driverId: number | null;
  carrierId: number | null;
  fechaViaje: string | null;
  esFantasma: boolean;
}

/**
 * Expone en el script los helpers de WebView que la base declara `protected`.
 * No agrega comportamiento: solo cambia la visibilidad.
 */
class GhostTripAuditScreen extends DriverHomeScreen {
  async irAWebView(): Promise<string | null> {
    return this.switchToWebView();
  }

  async leerCodigosDeViaje(): Promise<CodigoEnPantalla[]> {
    const crudos = await this.executeInWebView(() => {
      // Patrón del código visible de viaje: 4-5 dígitos, guion, 1-2 letras. Ej: 15146-FC.
      const PATRON = /\b(\d{4,5})-([A-Z]{1,2})\b/g;
      const salida: { codigo: string; idForCarrier: number; seccion: string }[] = [];
      const vistos = new Set<string>();

      // Encabezados que delimitan las dos secciones de la home.
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
          const codigo = m[0];
          if (vistos.has(codigo)) continue;
          vistos.add(codigo);
          salida.push({ codigo, idForCarrier: Number(m[1]), seccion: seccionActual });
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

  async capturar(ruta: string): Promise<void> {
    const png = await this.requireDriver().takeScreenshot();
    writeFileSync(ruta, Buffer.from(png, 'base64'));
  }
}

async function clasificar(codigos: CodigoEnPantalla[]): Promise<Hallazgo[]> {
  if (codigos.length === 0) return [];

  const db = new OracleDb();
  const ids = codigos.map((c) => c.idForCarrier);
  const binds: Record<string, unknown> = { carrier: CARRIER_ID };
  const placeholders = ids.map((id, i) => {
    binds[`id${i}`] = id;
    return `:id${i}`;
  });

  const vivos = await db.query<{
    IDFORCARRIER: number;
    STATE: number;
    DRIVER_ID: number | null;
    CARRIERACCOUNT_ID: number;
    FECHA: string | null;
  }>(
    `SELECT t.IDFORCARRIER, t.STATE, t.DRIVER_ID, t.CARRIERACCOUNT_ID,
            TO_CHAR(t.TRAVEL_DATE, 'YYYY-MM-DD HH24:MI') AS FECHA
       FROM MAGIIS.TRAVEL t
      WHERE t.CARRIERACCOUNT_ID = :carrier
        AND t.IDFORCARRIER IN (${placeholders.join(', ')})`,
    binds,
  );

  const archivados = await db.query<{
    IDFORCARRIER: number;
    STATE: number;
    DRIVER_ID: number | null;
    CARRIERACCOUNT_ID: number;
    FECHA: string | null;
  }>(
    `SELECT th.IDFORCARRIER, th.STATE, th.DRIVER_ID, th.CARRIERACCOUNT_ID,
            TO_CHAR(th.TRAVEL_DATE, 'YYYY-MM-DD HH24:MI') AS FECHA
       FROM MAGIIS.TRAVEL_HISTORY th
      WHERE th.CARRIERACCOUNT_ID = :carrier
        AND th.IDFORCARRIER IN (${placeholders.join(', ')})`,
    binds,
  );

  const porId = <T extends { IDFORCARRIER: number }>(filas: T[]): Map<number, T> =>
    new Map(filas.map((f) => [Number(f.IDFORCARRIER), f]));

  const mapaVivos = porId(vivos);
  const mapaArchivados = porId(archivados);

  return codigos.map((c) => {
    const vivo = mapaVivos.get(c.idForCarrier);
    const archivado = mapaArchivados.get(c.idForCarrier);
    const fila = vivo ?? archivado ?? null;
    const estado = nombreEstado(fila ? Number(fila.STATE) : null);

    let clasificacion: Clasificacion;
    if (vivo) clasificacion = ESTADOS_FINALES.has(estado) ? 'FINALIZADO' : 'VIVO';
    else if (archivado) clasificacion = 'ARCHIVADO';
    else clasificacion = 'INEXISTENTE';

    return {
      ...c,
      clasificacion,
      estado,
      driverId: fila ? (fila.DRIVER_ID === null ? null : Number(fila.DRIVER_ID)) : null,
      carrierId: fila ? Number(fila.CARRIERACCOUNT_ID) : null,
      fechaViaje: fila ? fila.FECHA : null,
      // Un viaje que la app ofrece pero que ya no se puede tomar.
      esFantasma: clasificacion !== 'VIVO',
    };
  });
}

function imprimirTabla(hallazgos: Hallazgo[]): void {
  const anchoCod = Math.max(9, ...hallazgos.map((h) => h.codigo.length));
  const fila = (a: string, b: string, c: string, d: string, e: string): string =>
    `  ${a.padEnd(anchoCod)}  ${b.padEnd(13)}  ${c.padEnd(12)}  ${d.padEnd(20)}  ${e}`;

  log('');
  log(fila('CÓDIGO', 'SECCIÓN', 'RESULTADO', 'ESTADO', 'FECHA DE VIAJE'));
  log(fila('-'.repeat(anchoCod), '-'.repeat(13), '-'.repeat(12), '-'.repeat(20), '-'.repeat(16)));
  for (const h of hallazgos) {
    log(
      fila(
        h.codigo,
        h.seccion,
        h.clasificacion,
        h.estado,
        h.fechaViaje ?? '—',
      ) + (h.esFantasma ? '   ← FANTASMA' : ''),
    );
  }
  log('');
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const marca = new Date().toISOString().replace(/[:.]/g, '-');

  const pantalla = new GhostTripAuditScreen(getDriverAppConfig());
  let hallazgos: Hallazgo[] = [];

  try {
    log('abriendo sesión con la app driver…');
    await pantalla.startSession();
    await pantalla.dismissPreHomeOverlayIfPresent();

    const contexto = await pantalla.irAWebView();
    if (!contexto) throw new Error('No se pudo cambiar al WebView de la app driver.');
    log(`contexto WebView: ${contexto}`);

    await pantalla.capturar(join(OUT_DIR, `home-${marca}.png`));

    const codigos = await pantalla.leerCodigosDeViaje();
    log(`códigos de viaje visibles en la home: ${codigos.length || 'ninguno'}`);
    if (codigos.length === 0) {
      log('la home no muestra ninguna card de viaje. Nada que auditar.');
      return;
    }

    hallazgos = await clasificar(codigos);
    imprimirTabla(hallazgos);
  } finally {
    await pantalla.endSession().catch(() => undefined);
  }

  const fantasmas = hallazgos.filter((h) => h.esFantasma);
  const reporte = {
    generado: new Date().toISOString(),
    ambiente: process.env.ENV ?? 'test',
    carrierId: CARRIER_ID,
    totalEnPantalla: hallazgos.length,
    fantasmas: fantasmas.length,
    hallazgos,
  };
  const rutaJson = join(OUT_DIR, `ghost-trips-${marca}.json`);
  writeFileSync(rutaJson, JSON.stringify(reporte, null, 2), 'utf-8');
  log(`reporte: ${rutaJson}`);

  if (fantasmas.length === 0) {
    log('OK — todos los viajes que muestra la home existen y están activos.');
    return;
  }

  log('');
  log(`BLOQUEANTE — ${fantasmas.length} de ${hallazgos.length} viajes en pantalla ya no son tomables.`);
  log('La app está ofreciendo viajes que la base no reconoce como disponibles.');
  log('No arranques la campaña móvil: cualquier caso que toque una de esas cards va a fallar');
  log('por un motivo ajeno al que se está probando.');

  if (SOFT) {
    log('(GHOST_AUDIT_SOFT=1 → se reporta pero no se corta)');
    return;
  }
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(`[ghost-audit] ERROR: ${(err as Error).message}`);
  process.exitCode = 1;
});
