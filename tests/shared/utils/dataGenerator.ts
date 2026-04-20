/**
 * tests/shared/utils/dataGenerator.ts
 * Generador centralizado de datos de prueba transversales.
 *
 * Dominio: auth / credentials
 * Importado por: login-failure.e2e.spec.ts, portals.smoke.spec.ts
 *
 * TODO (TIER 2.x): migrar console.log de seedOnce a debugLog de tests/helpers/debug.ts
 * TODO (TIER 2.x): mover faker bruto de gateway-pg/data/stripe-cards.ts → aquí o a fixtures/stripe/
 */
import { faker } from '@faker-js/faker';

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
			// TODO(TIER 2.x): reemplazar por debugLog('datagen', ...) de tests/helpers/debug.ts
			console.log(`[DataGenerator] Seed fijado: ${seed}`);
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
