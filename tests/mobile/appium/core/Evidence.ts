/**
 * Evidence — wrapper de `ScreenEvidence` (checkpoint -> captura) sin cambiar su contrato.
 * La captura se crea de forma perezosa: no toca el driver hasta el primer `capture`.
 */

import { ScreenEvidence, type ScreenshotRef } from '../helpers/screenEvidence';

/** Subconjunto de `ScreenEvidence` que usa el wrapper (permite fakes en unit). */
export type EvidenceCapturer = {
	capture(label: string): Promise<ScreenshotRef>;
	all(): ScreenshotRef[];
	manifest(): string[];
};

export class Evidence {
	private capturer: EvidenceCapturer | null = null;

	constructor(private readonly factory: () => EvidenceCapturer) {}

	/** Evidencia real sobre un driver (la carpeta de capturas es `evidence/screenshots/<runLabel>`). */
	static forDriver(getDriver: () => WebdriverIO.Browser, runLabel: string): Evidence {
		return new Evidence(() => new ScreenEvidence(getDriver(), runLabel));
	}

	private get shots(): EvidenceCapturer {
		this.capturer ??= this.factory();
		return this.capturer;
	}

	capture(label: string): Promise<ScreenshotRef> {
		return this.shots.capture(label);
	}

	/** Captura con la etiqueta `checkpoint-<stage>` (convención del flujo F5). */
	checkpoint(stage: string): Promise<ScreenshotRef> {
		return this.shots.capture(`checkpoint-${stage}`);
	}

	all(): ScreenshotRef[] {
		return this.capturer?.all() ?? [];
	}

	/** Rutas relativas en orden, listas para pegar en un reporte. */
	manifest(): string[] {
		return this.capturer?.manifest() ?? [];
	}
}
