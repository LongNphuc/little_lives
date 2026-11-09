import { MAX_AMOUNT, PAYMENT_METHODS } from "./constants";
import { ValidationError } from "./errors";
import { toCents } from "./money";

const WHOLE_CENT_TOLERANCE = 1e-4;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatReceivedValue(value: unknown): string {
  return typeof value === "string" ? `"${value}"` : String(value);
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(
      `${fieldName} must be a non-empty string, received ${formatReceivedValue(value)}`,
    );
  }
  return value;
}

function requireFiniteNumber(value: unknown, fieldName: string): number {
  if (!isFiniteNumber(value)) {
    throw new ValidationError(
      `${fieldName} must be a finite number, received ${formatReceivedValue(value)}`,
    );
  }
  return value;
}

function requirePositiveNumber(value: unknown, fieldName: string): number {
  const amount = requireFiniteNumber(value, fieldName);
  if (amount <= 0) {
    throw new ValidationError(`${fieldName} must be greater than 0, received ${amount}`);
  }
  return amount;
}

function requireNonNegativeNumber(value: unknown, fieldName: string): number {
  const amount = requireFiniteNumber(value, fieldName);
  if (amount < 0) {
    throw new ValidationError(`${fieldName} must not be negative, received ${amount}`);
  }
  return amount;
}

function requireWholeCents(amount: number, fieldName: string): void {
  if (Math.abs(amount * 100 - toCents(amount)) > WHOLE_CENT_TOLERANCE) {
    throw new ValidationError(
      `${fieldName} must have at most 2 decimal places, received ${amount}`,
    );
  }
}

function requireAtMostMaxAmount(amount: number, fieldName: string): void {
  if (amount > MAX_AMOUNT) {
    throw new ValidationError(`${fieldName} must not exceed ${MAX_AMOUNT}, received ${amount}`);
  }
}

function requireRate(value: unknown, fieldName: string): void {
  const rate = requireFiniteNumber(value, fieldName);
  if (rate < 0 || rate > 1) {
    throw new ValidationError(
      `${fieldName} must be between 0 and 1 (a fraction, e.g. 0.07 for 7%), received ${rate}`,
    );
  }
}

function describeItem(item: unknown, index: number): string {
  const position = `Item #${index + 1}`;
  if (isRecord(item) && typeof item.description === "string" && item.description.trim() !== "") {
    return `${position} ("${item.description.trim()}")`;
  }
  return position;
}

function validateItem(item: unknown, index: number): void {
  const label = describeItem(item, index);
  if (!isRecord(item)) {
    throw new ValidationError(`${label} must be an object, received ${formatReceivedValue(item)}`);
  }
  requireNonEmptyString(item.description, `${label}: description`);
  const quantity = requirePositiveNumber(item.quantity, `${label}: quantity`);
  const unitPrice = requirePositiveNumber(item.unitPrice, `${label}: unitPrice`);
  requireWholeCents(unitPrice, `${label}: unitPrice`);
  if (item.discountRate !== undefined) {
    requireRate(item.discountRate, `${label}: discountRate`);
  }
  requireAtMostMaxAmount(quantity * unitPrice, `${label}: quantity * unitPrice`);
}

export function validateItems(items: unknown, taxRate: unknown): void {
  if (!Array.isArray(items)) {
    throw new ValidationError(`items must be an array, received ${formatReceivedValue(items)}`);
  }
  items.forEach((item: unknown, index: number) => validateItem(item, index));
  requireRate(taxRate, "taxRate");
}

export function validateTotalWithinLimit(totalAmount: number): void {
  if (!Number.isFinite(totalAmount) || totalAmount > MAX_AMOUNT) {
    throw new ValidationError(
      `Invoice total exceeds the maximum supported amount of ${MAX_AMOUNT}, received ${totalAmount}`,
    );
  }
}

export function validateInvoiceNumber(invoiceNumber: unknown): void {
  requireNonEmptyString(invoiceNumber, "invoiceNumber");
}

export function validatePaymentAmount(amount: unknown, fieldName = "paymentAmount"): void {
  const value = requirePositiveNumber(amount, fieldName);
  requireAtMostMaxAmount(value, fieldName);
  requireWholeCents(value, fieldName);
}

export function validatePaymentMethod(paymentMethod: unknown): void {
  if (!PAYMENT_METHODS.some((allowedMethod) => allowedMethod === paymentMethod)) {
    throw new ValidationError(
      `paymentMethod must be one of: ${PAYMENT_METHODS.join(", ")}, received ${formatReceivedValue(paymentMethod)}`,
    );
  }
}

function validateInvoiceItemAmounts(item: unknown, index: number): void {
  const fieldPrefix = `invoice.items[${index}]`;
  if (!isRecord(item)) {
    throw new ValidationError(`${fieldPrefix} must be an object, received ${formatReceivedValue(item)}`);
  }
  requireNonEmptyString(item.id, `${fieldPrefix}.id`);
  requireNonNegativeNumber(item.lineTotal, `${fieldPrefix}.lineTotal`);
  requireNonNegativeNumber(item.taxAmount, `${fieldPrefix}.taxAmount`);
}

export function validateInvoice(invoice: unknown): void {
  if (!isRecord(invoice)) {
    throw new ValidationError(`invoice must be an object, received ${formatReceivedValue(invoice)}`);
  }
  requireNonEmptyString(invoice.id, "invoice.id");
  const totalAmount = requireNonNegativeNumber(invoice.totalAmount, "invoice.totalAmount");
  const outstandingAmount = requireFiniteNumber(invoice.outstandingAmount, "invoice.outstandingAmount");
  if (outstandingAmount > totalAmount) {
    throw new ValidationError(
      `invoice.outstandingAmount must not exceed invoice.totalAmount (${totalAmount}), received ${outstandingAmount}`,
    );
  }
  if (!Array.isArray(invoice.items)) {
    throw new ValidationError(
      `invoice.items must be an array, received ${formatReceivedValue(invoice.items)}`,
    );
  }
  invoice.items.forEach((item: unknown, index: number) => validateInvoiceItemAmounts(item, index));
}

export function validatePayment(payment: unknown): void {
  if (!isRecord(payment)) {
    throw new ValidationError(`payment must be an object, received ${formatReceivedValue(payment)}`);
  }
  requireNonEmptyString(payment.id, "payment.id");
  requireNonEmptyString(payment.invoiceId, "payment.invoiceId");
  validatePaymentAmount(payment.amount, "payment.amount");
}
