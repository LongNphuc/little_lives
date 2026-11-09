import { createInvoice, processPayment } from "../src";
import { createServiceInvoice } from "./helpers";

describe("Scenario 2: Multiple payments and overpayment", () => {
  it("starts from an invoice with total 1000.00 and outstanding 1000.00", () => {
    const invoice = createServiceInvoice(1000);

    expect(invoice.totalAmount).toBe(1000);
    expect(invoice.outstandingAmount).toBe(1000);
    expect(invoice.status).toBe("UNPAID");
  });

  it("payment1: 300.00 cash leaves 700.00 outstanding (PARTIALLY_PAID)", () => {
    const result = processPayment(createServiceInvoice(1000), 300.0, "cash");

    expect(result.invoice.outstandingAmount).toBe(700);
    expect(result.invoice.status).toBe("PARTIALLY_PAID");
    expect(result.overpaymentAmount).toBe(0);
    expect(result.payment.paymentMethod).toBe("cash");
  });

  it("payment2: 750.00 bank_transfer leaves -50.00 outstanding (OVERPAID, overpayment 50)", () => {
    const afterFirst = processPayment(createServiceInvoice(1000), 300.0, "cash");
    const afterSecond = processPayment(afterFirst.invoice, 750.0, "bank_transfer");

    expect(afterSecond.invoice.outstandingAmount).toBe(-50);
    expect(afterSecond.invoice.status).toBe("OVERPAID");
    expect(afterSecond.overpaymentAmount).toBe(50);
    expect(afterSecond.payment.paymentMethod).toBe("bank_transfer");
  });

  it("paying exactly the total marks the invoice PAID with outstanding 0", () => {
    const result = processPayment(createServiceInvoice(1000), 1000, "bank_transfer");

    expect(result.invoice.outstandingAmount).toBe(0);
    expect(result.invoice.status).toBe("PAID");
    expect(result.overpaymentAmount).toBe(0);
  });

  it("does not modify the original invoice", () => {
    const invoice = createServiceInvoice(1000);
    const snapshot = structuredClone(invoice);

    const result = processPayment(invoice, 300, "cash");

    expect(invoice).toEqual(snapshot);
    expect(result.invoice).not.toBe(invoice);
    expect(result.invoice.items).not.toBe(invoice.items);
    expect(result.invoice.items[0]).not.toBe(invoice.items[0]);
  });

  it("works with a frozen invoice because it never writes to its input", () => {
    const invoice = Object.freeze(createServiceInvoice(1000));

    expect(() => processPayment(invoice, 300, "cash")).not.toThrow();
  });

  it("creates a COMPLETED payment record linked to the invoice", () => {
    const invoice = createServiceInvoice(1000);

    const { payment } = processPayment(invoice, 300, "cash");

    expect(payment).toMatchObject({
      invoiceId: invoice.id,
      paymentMethod: "cash",
      amount: 300,
      status: "COMPLETED",
    });
    expect(payment.id).toEqual(expect.any(String));
    expect(payment.paymentDate).toBeInstanceOf(Date);
    expect(payment.referenceNumber).toMatch(/^PAY-[0-9a-f-]{36}$/);
  });

  it("keeps the invoice data other than outstandingAmount and status unchanged", () => {
    const invoice = createServiceInvoice(1000);

    const result = processPayment(invoice, 300, "cash");

    expect(result.invoice).toEqual({ ...invoice, outstandingAmount: 700, status: "PARTIALLY_PAID" });
  });

  it("keeps cent precision across payments of 0.10 and 0.20 on a 0.30 invoice", () => {
    const invoice = createInvoice([{ description: "Pencil", quantity: 3, unitPrice: 0.1 }], 0);

    const afterFirst = processPayment(invoice, 0.1, "cash");
    const afterSecond = processPayment(afterFirst.invoice, 0.2, "cash");

    expect(afterFirst.invoice.outstandingAmount).toBe(0.2);
    expect(afterSecond.invoice.outstandingAmount).toBe(0);
    expect(afterSecond.invoice.status).toBe("PAID");
  });

  it("pays the Scenario 1 invoice (589.57) in two parts", () => {
    const invoice = createInvoice(
      [
        { description: "Monthly Fee", quantity: 1, unitPrice: 500.0 },
        { description: "Activity Fee", quantity: 2, unitPrice: 25.5 },
      ],
      0.07,
    );

    const afterFirst = processPayment(invoice, 300, "cash");
    const afterSecond = processPayment(afterFirst.invoice, 289.57, "bank_transfer");

    expect(afterFirst.invoice.outstandingAmount).toBe(289.57);
    expect(afterSecond.invoice.outstandingAmount).toBe(0);
    expect(afterSecond.invoice.status).toBe("PAID");
  });
});
