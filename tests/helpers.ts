import { createInvoice, Invoice, PaymentMethod, ValidationError } from "../src";
import { fromCents, toCents } from "../src/money";

export function expectValidationError(action: () => unknown, expectedMessage: string): void {
  let caughtError: unknown;
  try {
    action();
  } catch (error) {
    caughtError = error;
  }
  expect(caughtError).toBeInstanceOf(ValidationError);
  expect((caughtError as ValidationError).name).toBe("ValidationError");
  expect((caughtError as ValidationError).message).toBe(expectedMessage);
}

export function sumAmounts(amounts: readonly number[]): number {
  return fromCents(amounts.reduce((totalCents, amount) => totalCents + toCents(amount), 0));
}

export function createServiceInvoice(total: number): Invoice {
  return createInvoice([{ description: "Service", quantity: 1, unitPrice: total }], 0);
}

export function asPaymentMethod(value: string): PaymentMethod {
  return value as PaymentMethod;
}
