// tests/TestBase.ts
import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { LoginPage } from './pages/LoginPage.js'; // ⬅️ extensión .js para ESM

type Fixtures = {
  loginPage: LoginPage;
};

const test = base.extend<Fixtures>({
  loginPage: async (
    { page }: { page: Page },
    use: (loginPage: LoginPage) => Promise<void>
  ) => {
    const loginPage = new LoginPage(page);
    await use(loginPage);
  }
});

export { test, expect };

// tests/pages/LoginPage.ts
