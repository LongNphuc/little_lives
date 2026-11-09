import { randomUUID } from "node:crypto";
import { ValidationError } from "./errors";
import { fromCents, toCents } from "./money";
import { Invoice, InvoiceStatus, Payment, PaymentMethod, PaymentResult } from "./types";
import { validateInvoice, validatePaymentAmount, validatePaymentMethod } from "./validation";

function statusAfterPayment(outstandingCents: number): InvoiceStatus {
  if (outstandingCents > 0) {
    return "PARTIALLY_PAID";
  }
  if (outstandingCents === 0) {
    return "PAID";
  }
  return "OVERPAID";
}

function generateReferenceNumber(): string {
  return `PAY-${randomUUID()}`;
}

export function processPayment(
  invoice: Invoice,
  paymentAmount: number,
  paymentMethod: PaymentMethod,
): PaymentResult {
  validateInvoice(invoice);
  validatePaymentAmount(paymentAmount);
  validatePaymentMethod(paymentMethod);

  const outstandingCents = toCents(invoice.outstandingAmount);
  if (outstandingCents <= 0) {
    throw new ValidationError(
      `Invoice is already fully paid or has nothing to pay: invoice ${invoice.invoiceNumber} has outstandingAmount ${invoice.outstandingAmount} and status ${invoice.status}`,
    );
  }

  const paymentCents = toCents(paymentAmount);
  const newOutstandingCents = outstandingCents - paymentCents;
  const overpaymentCents = Math.max(0, paymentCents - outstandingCents);

  const payment: Payment = {
    id: randomUUID(),
    invoiceId: invoice.id,
    paymentMethod,
    amount: fromCents(paymentCents),
    paymentDate: new Date(),
    referenceNumber: generateReferenceNumber(),
    status: "COMPLETED",
  };

  const updatedInvoice: Invoice = {
    ...invoice,
    items: invoice.items.map((item) => ({ ...item })),
    outstandingAmount: fromCents(newOutstandingCents),
    status: statusAfterPayment(newOutstandingCents),
  };

  return {
    invoice: updatedInvoice,
    payment,
    overpaymentAmount: fromCents(overpaymentCents),
  };
}
