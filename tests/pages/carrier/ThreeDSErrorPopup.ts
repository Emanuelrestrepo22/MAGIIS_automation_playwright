import type { Page } from '@playwright/test';
import { ErrorPopup as SharedErrorPopup } from './ErrorPopup';

export class ThreeDSErrorPopup extends SharedErrorPopup {
  constructor(page: Page) {
    super(page);
  }
}
