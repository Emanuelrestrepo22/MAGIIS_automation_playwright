import type { Page } from '@playwright/test';
import { NewTravelPageBase } from '../shared/NewTravelPageBase';

export type { NewTravelFormInput } from '../shared/NewTravelPageBase';

export class NewTravelPage extends NewTravelPageBase {
	constructor(page: Page) {
		super(page);
	}
}
