import { randomUUID } from "node:crypto";
import { fromCents, roundHalfUp, sumCents, toCents } from "./money";
import { Invoice, InvoiceItem, InvoiceItemInput, InvoiceStatus, InvoiceTotals } from "./types";
import { validateInvoiceNumber, validateItems, validateTotalWithinLimit } from "./validation";

interface CalculatedLine {
  item: InvoiceItem;
  lineTotalCents: number;
  taxAmountCents: number;
}

function calculateLine(input: InvoiceItemInput, taxRate: number): CalculatedLine {
  const grossCents = input.quantity * toCents(input.unitPrice);
  const lineTotalCents = roundHalfUp(grossCents * (1 - (input.discountRate ?? 0)));
  const taxAmountCents = roundHalfUp(lineTotalCents * taxRate);

  const item: InvoiceItem = {
    id: randomUUID(),
    description: input.description.trim(),
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    lineTotal: fromCents(lineTotalCents),
    taxRate,
    taxAmount: fromCents(taxAmountCents),
  };

  return {
    item: input.discountRate === undefined ? item : { ...item, discountRate: input.discountRate },
    lineTotalCents,
    taxAmountCents,
  };
}

export function calculateInvoiceTotal(
  items: readonly InvoiceItemInput[],
  taxRate: number,
): InvoiceTotals {
  validateItems(items, taxRate);

  const calculatedLines = items.map((item) => calculateLine(item, taxRate));
  const subtotalCents = sumCents(calculatedLines.map((line) => line.lineTotalCents));
  const totalTaxCents = sumCents(calculatedLines.map((line) => line.taxAmountCents));
  const totalAmountCents = subtotalCents + totalTaxCents;

  validateTotalWithinLimit(fromCents(totalAmountCents));

  return {
    items: calculatedLines.map((line) => line.item),
    subtotal: fromCents(subtotalCents),
    totalTax: fromCents(totalTaxCents),
    totalAmount: fromCents(totalAmountCents),
  };
}

function generateInvoiceNumber(): string {
  return `INV-${randomUUID()}`;
}

function initialStatusFor(totalAmount: number): InvoiceStatus {
  return totalAmount === 0 ? "PAID" : "UNPAID";
}

export function createInvoice(
  items: readonly InvoiceItemInput[],
  taxRate: number,
  invoiceNumber?: string,
): Invoice {
  if (invoiceNumber !== undefined) {
    validateInvoiceNumber(invoiceNumber);
  }

  const totals = calculateInvoiceTotal(items, taxRate);

  return {
    id: randomUUID(),
    invoiceNumber: invoiceNumber?.trim() ?? generateInvoiceNumber(),
    invoiceDate: new Date(),
    items: totals.items,
    totalAmount: totals.totalAmount,
    totalTax: totals.totalTax,
    outstandingAmount: totals.totalAmount,
    status: initialStatusFor(totals.totalAmount),
  };
}
