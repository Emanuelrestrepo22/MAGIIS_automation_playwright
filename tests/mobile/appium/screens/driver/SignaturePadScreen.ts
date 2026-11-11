/**
 * SignaturePadScreen — modal de firma del pasajero (`app-page-signer`, DOM dump 2026-10-21, viaje CC 71654).
 * Canvas `app-page-signer canvas.canvas-draw` + footer «Clear» (btn-outlined-primary) / «Confirm» (button.btn.primary).
 * Tras «Sign and Close Trip» el viaje NO cierra hasta confirmar la firma.
 * POM puro: acciones atómicas (`sign`, `confirm`, `clear`) + estados (`isShown`, `hasInk`). Sin aserciones.
 */

import { defineLocator } from '../../core/Locator';
import type { MobileSession } from '../../core/MobileSession';
import { Waits, type UntilOptions } from '../../core/Waits';

const CANVAS_SELECTOR = 'app-page-signer canvas';
const CONFIRM_SELECTOR = 'app-page-signer ion-footer button.btn.primary';
const CLEAR_SELECTOR = 'app-page-signer ion-footer button.btn-outlined-primary';
const CANVAS = defineLocator({ id: 'driver.signature.canvas', web: CANVAS_SELECTOR });
const CONFIRM_BUTTON = defineLocator({ id: 'driver.signature.confirm', web: CONFIRM_SELECTOR });
const CLEAR_BUTTON = defineLocator({ id: 'driver.signature.clear', web: CLEAR_SELECTOR });

export type CanvasRect = { x: number; y: number; w: number; h: number };
export type StrokePoint = { x: number; y: number };

/** Trazo en zigzag proporcional al canvas (fracciones fijas). */
const STROKE_FRACTIONS = [
	[0.2, 0.5],
	[0.35, 0.3],
	[0.5, 0.7],
	[0.65, 0.35],
	[0.8, 0.6]
] as const;

/** Puntos del trazo en coordenadas de ventana; función pura. */
export function strokePoints(rect: CanvasRect): StrokePoint[] {
	return STROKE_FRACTIONS.map(([fx, fy]) => ({ x: Math.round(rect.x + rect.w * fx), y: Math.round(rect.y + rect.h * fy) }));
}

export class SignaturePadScreen {
	constructor(private readonly session: MobileSession) {}

	private async web() {
		if ((await this.session.context()) !== 'webview') await this.session.switchContext('webview');
		return this.session.driver;
	}

	/** Rect del canvas en la ventana de la WebView, o null si no está visible. */
	async readCanvasRect(): Promise<CanvasRect | null> {
		const driver = await this.web();
		return driver
			.execute<CanvasRect | null, [string]>((sel: string) => {
				const c = document.querySelector(sel) as HTMLCanvasElement | null;
				if (!c) return null;
				const r = c.getBoundingClientRect();
				return r.width > 5 && r.height > 5 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
			}, CANVAS_SELECTOR)
			.catch(() => null);
	}

	async isShown(): Promise<boolean> {
		return (await this.readCanvasRect()) !== null;
	}

	async waitUntilShown(options: UntilOptions = {}): Promise<void> {
		await Waits.until(() => this.isShown(), { label: `${CANVAS.id} visible`, timeout: 15_000, ...options });
	}

	async waitUntilClosed(options: UntilOptions = {}): Promise<void> {
		await Waits.until(async () => !(await this.isShown()), { label: 'modal de firma cerrado', timeout: 15_000, ...options });
	}

	/** Estado observable: el canvas tiene al menos un píxel con alpha distinto de 0. */
	async hasInk(): Promise<boolean> {
		const driver = await this.web();
		return driver
			.execute<boolean, [string]>((sel: string) => {
				const c = document.querySelector(sel) as HTMLCanvasElement | null;
				const ctx = c?.getContext('2d');
				if (!c || !ctx) return false;
				const data = ctx.getImageData(0, 0, c.width, c.height).data;
				for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
				return false;
			}, CANVAS_SELECTOR)
			.catch(() => false);
	}

	/** Dibuja un trazo con W3C touch actions. Lanza si el canvas no está visible. Devuelve los puntos usados. */
	async sign(): Promise<StrokePoint[]> {
		const rect = await this.readCanvasRect();
		if (!rect) throw new Error(`[SignaturePadScreen] ${CANVAS.id}: canvas de firma no visible.`);
		const points = strokePoints(rect);
		const driver = await this.web();
		const [first, ...rest] = points as [StrokePoint, ...StrokePoint[]];
		await driver.performActions([
			{
				type: 'pointer',
				id: 'finger1',
				parameters: { pointerType: 'touch' },
				actions: [
					{ type: 'pointerMove', duration: 0, x: first.x, y: first.y },
					{ type: 'pointerDown', button: 0 },
					...rest.map(p => ({ type: 'pointerMove' as const, duration: 120, x: p.x, y: p.y })),
					{ type: 'pointerUp', button: 0 }
				]
			}
		]);
		await driver.releaseActions().catch(() => undefined);
		return points;
	}

	private async tapFooter(sel: string): Promise<boolean> {
		const driver = await this.web();
		return driver
			.execute<boolean, [string]>((s: string) => {
				const btn = document.querySelector(s) as HTMLButtonElement | null;
				if (!btn || btn.offsetParent === null || btn.disabled) return false;
				btn.click();
				return true;
			}, sel)
			.catch(() => false);
	}

	/** Toca «Confirm». Lanza si el botón no está o está deshabilitado. */
	async confirm(): Promise<void> {
		if (!(await this.tapFooter(CONFIRM_SELECTOR))) {
			throw new Error(`[SignaturePadScreen] ${CONFIRM_BUTTON.id}: botón «Confirm» no encontrado o deshabilitado.`);
		}
	}

	/** Toca «Clear» (borra el trazo). */
	async clear(): Promise<void> {
		if (!(await this.tapFooter(CLEAR_SELECTOR))) {
			throw new Error(`[SignaturePadScreen] ${CLEAR_BUTTON.id}: botón «Clear» no encontrado.`);
		}
	}
}
