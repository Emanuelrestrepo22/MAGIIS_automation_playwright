/**
 * Recuperar la sesion de App PAX cuando un relanzamiento de la app cae en /login.
 *
 * POR QUE EXISTE. `pax-address-behaviors.spec.ts` relanza la app antes de cada superficie para
 * devolverla a un punto de partida conocido. Eso reintroduce un riesgo que la sesion unica habia
 * escondido: el arranque en frio vuelve a correr el bootstrap de autenticacion CINCO veces donde
 * antes corria cero. Si el token esta vencido, la app aterriza en /login y las cinco superficies se
 * reportan inalcanzables A LA VEZ — un fallo que se lee como "el harness no llega a las pantallas"
 * cuando en realidad es "no hay sesion".
 *
 * Sin esto, ese escenario cuesta una corrida completa de ~15 minutos en un dispositivo fisico y
 * produce un diagnostico enganoso. Detectarlo y recuperarlo es mas barato que volver a correr.
 *
 * QUE HACE Y QUE NO. Detecta la pantalla de login, cierra el modal de sesion expirada si esta, y
 * reintenta el login con credenciales del ENTORNO. NO inventa credenciales: si faltan, devuelve un
 * estado explicito y el llamador decide. Un fallo de login NO es un defecto del producto y nunca
 * debe convertirse en un test rojo — el spec lo traduce a superficie inalcanzable con motivo.
 *
 * QUE SE COMPARTE CON EL HARNESS Y QUE NO. `PassengerTripHappyPathHarness` resuelve el mismo
 * problema para su propio flujo con metodos privados. Hoy los dos leen las credenciales del MISMO
 * SoT (`PASSENGER_APP_USER`), asi que no puede haber divergencia en esa parte. Lo que sigue
 * duplicado es la LOGICA de deteccion y submit del login; no se unifico porque el harness funciona,
 * lo usan varios scripts, y refactorizarlo a mitad de una campania de release es riesgo sin
 * beneficio inmediato. Si el harness se toca por otro motivo, deberia adoptar este modulo.
 *
 * Las credenciales NO se leen de `process.env` aca, y no hay defaults en el codigo.
 */

import type { remote } from 'webdriverio';
// Relativo y al `index` explicito: los runners Appium corren bajo `ts-node/esm` crudo, donde los
// alias de tsconfig no resuelven y un import de directorio depende de un flag no universal.
import { PASSENGER_APP_USER, getCurrentUserEnvironment } from '../../../fixtures/users/index';

type Driver = Awaited<ReturnType<typeof remote>>;

/** Resultado de intentar asegurar la sesion. Todos los caminos son explicitos a proposito. */
export type SessionOutcome =
	| { status: 'con-sesion'; detalle: string }
	| { status: 'recuperada'; detalle: string }
	| { status: 'sin-credenciales'; detalle: string }
	| { status: 'fallo'; detalle: string };

/**
 * La app usa dos formas de decir "no hay sesion": la ruta /login y el parametro invalid_token.
 * Chequear solo una deja pasar la otra.
 */
export function isLoginUrl(url: string): boolean {
	return url.includes('/login') || url.includes('invalid_token=true');
}

/**
 * Cierra el modal "Su sesion ha expirado" si esta presente.
 *
 * Devuelve un string y no un boolean porque los tres casos se distinguen en el log: no habia modal,
 * se cerro, o habia modal pero sin boton reconocible — el ultimo es un cambio de UI que hay que ver.
 */
export async function closeExpiredModalIfPresent(driver: Driver): Promise<string> {
	return driver
		.execute<string, []>(() => {
			const modal = Array.from(document.querySelectorAll('ion-modal')).find(el =>
				(el.textContent ?? '').includes('Su sesión ha expirado')
			);
			if (!modal) return 'sin-modal';

			const buttons = Array.from(document.querySelectorAll('button, ion-button, [role="button"]'));
			const aceptar = buttons.find(el => el.textContent?.trim() === 'Aceptar') as HTMLElement | undefined;
			if (aceptar) {
				aceptar.click();
				return 'modal-cerrado';
			}
			return 'modal-sin-boton-aceptar';
		})
		.catch(() => 'error-al-leer-el-modal');
}

/**
 * Asegura que la app tenga sesion. Idempotente: si ya hay sesion no toca nada.
 *
 * Se asume que el driver YA esta en el contexto WEBVIEW — el llamador acaba de resolverlo.
 */
export async function ensurePassengerSession(driver: Driver): Promise<SessionOutcome> {
	const url = await driver.getUrl().catch(() => '');
	if (!isLoginUrl(url)) {
		return { status: 'con-sesion', detalle: `la app no esta en login (url: ${url.slice(-70) || 'sin dato'})` };
	}

	const modal = await closeExpiredModalIfPresent(driver);
	if (modal === 'modal-cerrado') await driver.pause(1200);

	// Credenciales desde el fixture canonico, NO leyendo process.env aca. La primera version de este
	// modulo leia el entorno por su cuenta, y eso creaba un SEGUNDO lector de credenciales que podia
	// divergir del SoT: el fixture acepta nombres por ambiente (`PASSENGER_EMAIL_UAT`) y los alias
	// `USER_PASSENGER` / `PASS_PASSENGER` que usa `.env.uat`, y un lector propio no veia ninguno de
	// esos. Se arreglaba el harness y se dejaba el mismo defecto aca.
	//
	// El fixture LANZA cuando falta la variable; aca eso se traduce a un estado, no a una excepcion,
	// porque un problema de sesion no debe pintar un test de rojo.
	let email: string;
	let password: string;
	try {
		const user = PASSENGER_APP_USER[getCurrentUserEnvironment()];
		email = user.email;
		password = user.password;
	} catch (e) {
		return {
			status: 'sin-credenciales',
			detalle: `la app cayo en login (modal: ${modal}) y no hay credenciales para recuperarla — ${(e as Error).message}`
		};
	}

	const relleno = await driver
		.execute<string, [string, string]>(
			(loginEmail: string, loginPassword: string): string => {
				const emailInput = document.querySelector(
					'input[type="email"], input[placeholder="Email"]'
				) as HTMLInputElement | null;
				const passwordInput = document.querySelector(
					'input[type="password"], input[placeholder="Contraseña"]'
				) as HTMLInputElement | null;
				if (!emailInput || !passwordInput) return 'sin-campos';

				const setValue = (el: HTMLInputElement, value: string): void => {
					const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
					setter?.call(el, value);
					el.dispatchEvent(new Event('input', { bubbles: true }));
					el.dispatchEvent(new Event('change', { bubbles: true }));
				};
				setValue(emailInput, loginEmail);
				setValue(passwordInput, loginPassword);

				const buttons = Array.from(document.querySelectorAll('button, ion-button, [role="button"]'));
				const submit = buttons.find(el => {
					const text = el.textContent?.trim();
					return text === 'Ingresar' || text === 'Entrar' || text === 'Login' || text === 'Iniciar sesión';
				}) as HTMLElement | undefined;
				if (submit) {
					submit.click();
					return 'enviado';
				}
				return 'campos-llenos-sin-boton';
			},
			email,
			password
		)
		.catch((e: Error) => `error:${e.message}`);

	if (relleno !== 'enviado') {
		return { status: 'fallo', detalle: `no se pudo enviar el login (${relleno})` };
	}

	// Esperar a salir de /login. Se confirma por la URL y no por un sleep fijo: el login real tarda
	// distinto segun la red, y un sleep corto daria un falso "no recupero".
	const deadline = Date.now() + 25_000;
	let ultima = '';
	while (Date.now() < deadline) {
		await driver.pause(1000);
		ultima = await driver.getUrl().catch(() => '');
		if (ultima && !isLoginUrl(ultima)) {
			return { status: 'recuperada', detalle: `login rehecho, la app quedo en ${ultima.slice(-70)}` };
		}
	}

	return {
		status: 'fallo',
		detalle: `el login se envio pero la app sigue en login tras 25 s (url: ${ultima.slice(-70) || 'sin dato'})`
	};
}
