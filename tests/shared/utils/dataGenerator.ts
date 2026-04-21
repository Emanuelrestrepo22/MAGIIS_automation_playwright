/**
 * tests/shared/utils/dataGenerator.ts
 * Generador centralizado de datos de prueba transversales.
 *
 * Dominio: auth / credentials (emails, passwords aleatorios para casos negativos).
 * Importado por: login-failure.e2e.spec.ts, portals.smoke.spec.ts.
 *
 * **Alcance intencional — qué NO va acá:**
 * No hay generadores de tarjetas Stripe en este módulo y no deben agregarse. En
 * los tests de gateway la **respuesta esperada la determina el número de la
 * tarjeta** (`4242` aprobado, `9235` falla 3DS, `9995` insufficient_funds, etc.),
 * no data aleatoria. Por eso las tarjetas viven fijas en
 * `tests/fixtures/stripe/cards.ts` + `card-policy.ts` — son SoT determinística,
 * no algo a generar. Cualquier campo auxiliar (holderName, zip) es inerte al
 * outcome Stripe y se resuelve dentro del registry, no acá.
 */
import { faker } from '@faker-js/faker';
import { debugLog } from '../../helpers/debug';

export class DataGenerator {
	private static seeded = false;

	/**
	 * Fija la semilla de faker una sola vez por proceso (idempotente).
	 * Llamar al inicio de cada suite para reproducibilidad.
	 */
	static seedOnce(): void {
		if (!this.seeded) {
			const seed = Date.now();
			faker.seed(seed);
			this.seeded = true;
			debugLog('datagen', `Seed fijado: ${seed}`);
		}
	}

	/**
	 * Genera un email sintético bien formado para casos de credenciales no registradas.
	 * Nota: el email es estructuralmente válido — "inválido" se refiere a que no existe en el sistema.
	 */
	static getInvalidEmail(): string {
		return faker.internet.email();
	}

	/**
	 * Genera una contraseña aleatoria para casos de credenciales incorrectas.
	 */
	static getInvalidPassword(): string {
		return faker.internet.password();
	}

	/**
	 * Devuelve un par email + password no registrados en el sistema.
	 * Combinación de getInvalidEmail() + getInvalidPassword().
	 */
	static getInvalidCredentials(): { email: string; password: string } {
		return {
			email: this.getInvalidEmail(),
			password: this.getInvalidPassword()
		};
	}
}
