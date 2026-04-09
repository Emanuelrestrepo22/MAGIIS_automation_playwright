//tests\utils\dataGenerator.ts
import { faker } from '@faker-js/faker';

export class DataGenerator {
	private static seeded = false;

	static seedOnce(): void {
		if (!this.seeded) {
			const seed = Date.now();
			faker.seed(seed);
			this.seeded = true;
			console.log(`[DataGenerator] Seed fijado: ${seed}`);
		}
	}

	static getInvalidEmail(): string {
		return faker.internet.email();
	}

	static getInvalidPassword(): string {
		return faker.internet.password();
	}

	static getInvalidCredentials(): { email: string; password: string } {
		return {
			email: this.getInvalidEmail(),
			password: this.getInvalidPassword()
		};
	}
}
