/**
 * Posición GPS del emulador Android vía `adb emu geo fix` (sólo emuladores `emulator-*`).
 *
 * Por qué adb y no `setGeoLocation` de Appium: en la campaña UAT de Universal F1 (29/09/2026) el
 * cierre del viaje en la App Driver se ejercitó moviendo el emulador con `adb emu geo fix`
 * (origen antes de aceptar, destino antes de finalizar) y es el camino medido. En un teléfono
 * físico no hay consola de emulador: la función avisa y no hace nada.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

function adbBinary(): string {
	const home = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
	if (home) {
		const candidate = path.join(home, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
		if (existsSync(candidate)) return candidate;
	}
	return 'adb';
}

/** Mueve el GPS del emulador. Devuelve false (sin fallar) si el udid no es un emulador. */
export async function setEmulatorGeo(
	udid: string | null,
	point: { longitude: number; latitude: number }
): Promise<boolean> {
	if (!udid || !udid.startsWith('emulator-')) {
		console.warn(`[emulatorGeo] udid "${udid}" no es un emulador: no se mueve el GPS.`);
		return false;
	}
	// `geo fix` recibe LONGITUD primero y después latitud.
	await run(adbBinary(), ['-s', udid, 'emu', 'geo', 'fix', String(point.longitude), String(point.latitude)]);
	return true;
}
