//tests\selectors\login.ts

const loginSelectorsTest = {
	emailInput: '#email',
	passwordInput: '#password-input',
	submitButton: 'form button[type="submit"]',
	errorMessage: 'span.error-sign-in'
};

const loginSelectorsProd = {
	emailInput: 'input[placeholder="eMail"]',
	passwordInput: 'input[type="password"]',
	submitButton: 'button[type="submit"]',
	errorMessage: 'div.toast-message'
};

export const loginSelectors = process.env.ENV === 'prod' ? loginSelectorsProd : loginSelectorsTest;
