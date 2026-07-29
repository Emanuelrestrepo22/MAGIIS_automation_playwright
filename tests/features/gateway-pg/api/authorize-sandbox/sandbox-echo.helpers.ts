/**
 * Gate de precondición para los ECHO CODES del sandbox Authorize.net (BL-036).
 *
 * El sandbox solo puebla `cvvResultCode`/`avsResultCode` si la cuenta sandbox
 * tiene la verificación CVV/AVS habilitada (Merchant Interface → Account →
 * Settings → Security Settings → Card Code Verification / Address Verification
 * Service). Cuenta recién creada/por defecto → echo VACÍO aunque la transacción
 * apruebe correctamente.
 *
 * Contrato del gate (NO debilita el oráculo — auditoría de oráculos 2026-07-27):
 * - Echo POBLADO  → assert DURO contra el código documentado (M/N/P/G/...).
 * - Echo VACÍO    → test.skip DOCUMENTADO: la aprobación ya fue asertada duro
 *   antes de llamar este gate; lo pendiente es solo el contrato de echo, que es
 *   inverificable hasta configurar la cuenta. Se auto-endurece al habilitarla.
 *
 * Verificado live 2026-07-28: cuenta sandbox del equipo devuelve echo vacío con
 * Response Code 1 correcto (patrón idéntico al hallazgo BL-036 del 2026-07-24).
 */
import { test, expect } from '@TestFixture';

export function expectEchoCodeOrSkip(
	actual: string | undefined,
	expected: string,
	field: 'cvvResultCode' | 'avsResultCode'
): void {
	test.skip(
		!actual,
		`${field} vacío: la cuenta sandbox Authorize no tiene la verificación CVV/AVS habilitada ` +
			`(Security Settings) — la APROBACIÓN ya se asertó duro; el contrato de echo queda pendiente ` +
			`de configurar la cuenta (ver docblock de sandbox-echo.helpers.ts)`
	);
	expect(actual, `${field} (echo del sandbox)`).toBe(expected);
}
