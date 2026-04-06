//tests\selectors\login.ts

const loginSelectorsTest = {
	emailInput: 'input[placeholder="Email"]',
	passwordInput: 'input[placeholder="Contraseña"]',
	submitButton: 'button[type="submit"]',
	errorMessage: '.toast-message'
};

const loginSelectorsProd = {
	emailInput: 'input[placeholder="eMail"]',
	passwordInput: 'input[type="password"]',
	submitButton: 'button[type="submit"]',
	errorMessage: 'div.toast-message'
};

export const loginSelectors = process.env.ENV === 'prod' ? loginSelectorsProd : loginSelectorsTest;
