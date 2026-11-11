/**
 * SignaturePBO — firma del pasajero en el cierre con cuenta corriente: esperar el modal, trazar,
 * verificar que quedó tinta, confirmar y verificar que el modal cerró. Compone `SignaturePadScreen`;
 * NO tiene locators.
 */

import type { MobileSession } from '../core/MobileSession';
import { SignaturePadScreen, type StrokePoint } from '../screens/driver/SignaturePadScreen';

export class SignatureInkMissingError extends Error {
	constructor() {
		super('[SignaturePBO] El trazo no dejó tinta en el canvas de firma; no se confirma una firma vacía.');
		this.name = 'SignatureInkMissingError';
	}
}

export type SignatureResult = {
	signed: true;
	/** Puntos del trazo (coordenadas de ventana), para evidencia. */
	points: StrokePoint[];
};

export type SignaturePboDeps = {
	pad: Pick<SignaturePadScreen, 'waitUntilShown' | 'sign' | 'hasInk' | 'confirm' | 'clear' | 'waitUntilClosed'>;
};

export type SignaturePboRuntime = { log: (message: string) => void };

export class SignaturePBO {
	private readonly out: SignaturePboRuntime;

	constructor(
		private readonly deps: SignaturePboDeps,
		out: Partial<SignaturePboRuntime> = {}
	) {
		this.out = { log: out.log ?? (m => console.log(m)) };
	}

	static forSession(session: MobileSession, out?: Partial<SignaturePboRuntime>): SignaturePBO {
		return new SignaturePBO({ pad: new SignaturePadScreen(session) }, out);
	}

	/** Firma + confirma. Sin tinta: limpia el canvas y lanza (nunca confirma una firma vacía). */
	async signAndConfirm(timeoutMs = 15_000): Promise<SignatureResult> {
		await this.deps.pad.waitUntilShown({ timeout: timeoutMs });
		const points = await this.deps.pad.sign();
		if (!(await this.deps.pad.hasInk())) {
			await this.deps.pad.clear();
			throw new SignatureInkMissingError();
		}
		await this.deps.pad.confirm();
		await this.deps.pad.waitUntilClosed({ timeout: timeoutMs });
		this.out.log('[SignaturePBO] Firma confirmada y modal cerrado.');
		return { signed: true, points };
	}
}
