//tests\utils\dataGenerator.ts
import { faker } from '@faker-js/faker';

export class DataGenerator {
  static getInvalidEmail(): string {
    return faker.internet.email();
  }

  static getInvalidPassword(): string {
    return faker.internet.password();
  }

  static getInvalidCredentials(): { email: string; password: string } {
    return {
      email: this.getInvalidEmail(),
      password: this.getInvalidPassword(),
    };
  }
}
