import { randomUUID } from "node:crypto";
import { ValidationError } from "./errors";
import { fromCents, toCents } from "./money";
import { Invoice, InvoiceItem, Payment, Receipt, ReceiptItem } from "./types";
import { validateInvoice, validatePayment } from "./validation";

function allocatePaymentToItems(
  items: readonly InvoiceItem[],
  paidBeforeCents: number,
  paymentCents: number,
): ReceiptItem[] {
  let earlierPaymentsLeftCents = paidBeforeCents;
  let currentPaymentLeftCents = paymentCents;
  const receiptItems: ReceiptItem[] = [];

  for (const item of items) {
    const itemTotalCents = toCents(item.lineTotal) + toCents(item.taxAmount);
    const coveredByEarlierPaymentsCents = Math.min(itemTotalCents, earlierPaymentsLeftCents);
    earlierPaymentsLeftCents -= coveredByEarlierPaymentsCents;

    const owedBeforeThisPaymentCents = itemTotalCents - coveredByEarlierPaymentsCents;
    const allocatedCents = Math.min(owedBeforeThisPaymentCents, currentPaymentLeftCents);
    currentPaymentLeftCents -= allocatedCents;

    receiptItems.push({
      itemId: item.id,
      description: item.description,
      itemTotal: fromCents(itemTotalCents),
      allocatedAmount: fromCents(allocatedCents),
      remainingAmount: fromCents(owedBeforeThisPaymentCents - allocatedCents),
    });
  }

  return receiptItems;
}

function generateReceiptNumber(): string {
  return `RCP-${randomUUID()}`;
}

export function generateReceipt(payment: Payment, invoice: Invoice): Receipt {
  validatePayment(payment);
  validateInvoice(invoice);

  if (payment.invoiceId !== invoice.id) {
    throw new ValidationError(
      `Cannot generate receipt: payment ${payment.id} belongs to invoice ${payment.invoiceId}, not to invoice ${invoice.id}`,
    );
  }

  const paymentCents = toCents(payment.amount);
  const paidBeforeCents =
    toCents(invoice.totalAmount) - toCents(invoice.outstandingAmount) - paymentCents;

  if (paidBeforeCents < 0) {
    throw new ValidationError(
      `Cannot generate receipt: invoice ${invoice.id} does not include payment ${payment.id}. Pass the invoice returned by processPayment for this payment`,
    );
  }

  return {
    id: randomUUID(),
    paymentId: payment.id,
    receiptNumber: generateReceiptNumber(),
    receiptDate: new Date(),
    totalPaid: fromCents(paymentCents),
    remainingBalance: invoice.outstandingAmount,
    items: allocatePaymentToItems(invoice.items, paidBeforeCents, paymentCents),
  };
}
