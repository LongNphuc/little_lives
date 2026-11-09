import { createInvoice, generateReceipt, Invoice, Payment, processPayment } from "../src";
import { createServiceInvoice, expectValidationError, sumAmounts } from "./helpers";

function createScenarioOneInvoice(): Invoice {
  return createInvoice(
    [
      { description: "Monthly Fee", quantity: 1, unitPrice: 500.0 },
      { description: "Activity Fee", quantity: 2, unitPrice: 25.5 },
    ],
    0.07,
    "INV-1001",
  );
}

function allocatedTotal(receipt: { items: { allocatedAmount: number }[] }): number {
  return sumAmounts(receipt.items.map((item) => item.allocatedAmount));
}

describe("Receipt generation and financial reconciliation", () => {
  it("allocates a partial payment to items in invoice order", () => {
    const invoice = createScenarioOneInvoice();
    const { invoice: paidInvoice, payment } = processPayment(invoice, 300, "cash");

    const receipt = generateReceipt(payment, paidInvoice);

    expect(receipt.items).toEqual([
      {
        itemId: invoice.items[0].id,
        description: "Monthly Fee",
        itemTotal: 535,
        allocatedAmount: 300,
        remainingAmount: 235,
      },
      {
        itemId: invoice.items[1].id,
        description: "Activity Fee",
        itemTotal: 54.57,
        allocatedAmount: 0,
        remainingAmount: 54.57,
      },
    ]);
    expect(allocatedTotal(receipt)).toBe(payment.amount);
  });

  it("fills the receipt header from the payment", () => {
    const { invoice, payment } = processPayment(createScenarioOneInvoice(), 300, "cash");

    const receipt = generateReceipt(payment, invoice);

    expect(receipt.paymentId).toBe(payment.id);
    expect(receipt.totalPaid).toBe(300);
    expect(receipt.receiptNumber).toMatch(/^RCP-[0-9a-f-]{36}$/);
    expect(receipt.receiptDate).toBeInstanceOf(Date);
    expect(receipt.id).toEqual(expect.any(String));
  });

  it("sets remainingBalance to the invoice outstandingAmount after the payment", () => {
    const { invoice, payment } = processPayment(createScenarioOneInvoice(), 300, "cash");

    const receipt = generateReceipt(payment, invoice);

    expect(receipt.remainingBalance).toBe(invoice.outstandingAmount);
    expect(receipt.remainingBalance).toBe(289.57);
  });

  it("continues allocating from where the previous payment stopped", () => {
    const first = processPayment(createScenarioOneInvoice(), 300, "cash");
    const second = processPayment(first.invoice, 250, "bank_transfer");
    const third = processPayment(second.invoice, 39.57, "cash");

    const secondReceipt = generateReceipt(second.payment, second.invoice);
    const thirdReceipt = generateReceipt(third.payment, third.invoice);

    expect(secondReceipt.items.map(({ allocatedAmount, remainingAmount }) => ({ allocatedAmount, remainingAmount }))).toEqual([
      { allocatedAmount: 235, remainingAmount: 0 },
      { allocatedAmount: 15, remainingAmount: 39.57 },
    ]);
    expect(secondReceipt.remainingBalance).toBe(39.57);

    expect(thirdReceipt.items.map(({ allocatedAmount, remainingAmount }) => ({ allocatedAmount, remainingAmount }))).toEqual([
      { allocatedAmount: 0, remainingAmount: 0 },
      { allocatedAmount: 39.57, remainingAmount: 0 },
    ]);
    expect(thirdReceipt.remainingBalance).toBe(0);
  });

  it("allocations across all receipts add up to each item total once the invoice is paid", () => {
    const first = processPayment(createScenarioOneInvoice(), 100, "cash");
    const second = processPayment(first.invoice, 450, "bank_transfer");
    const third = processPayment(second.invoice, 39.57, "cash");
    const receipts = [first, second, third].map((result) => generateReceipt(result.payment, result.invoice));

    const allocatedPerItem = third.invoice.items.map((_, index) =>
      sumAmounts(receipts.map((receipt) => receipt.items[index].allocatedAmount)),
    );

    expect(allocatedPerItem).toEqual([535, 54.57]);
    expect(sumAmounts(allocatedPerItem)).toBe(third.invoice.totalAmount);
  });

  it("does not allocate the overpaid part to any item: allocated = amount - overpayment", () => {
    const result = processPayment(createScenarioOneInvoice(), 600, "bank_transfer");

    const receipt = generateReceipt(result.payment, result.invoice);

    expect(result.overpaymentAmount).toBe(10.43);
    expect(allocatedTotal(receipt)).toBe(589.57);
    expect(allocatedTotal(receipt)).toBe(sumAmounts([result.payment.amount, -result.overpaymentAmount]));
    expect(receipt.items.every((item) => item.remainingAmount === 0)).toBe(true);
    expect(receipt.totalPaid).toBe(600);
    expect(receipt.remainingBalance).toBe(-10.43);
  });

  it("handles Scenario 2: the 750 payment covers the remaining 700 and leaves -50", () => {
    const first = processPayment(createServiceInvoice(1000), 300, "cash");
    const second = processPayment(first.invoice, 750, "bank_transfer");

    const receipt = generateReceipt(second.payment, second.invoice);

    expect(receipt.items).toEqual([
      expect.objectContaining({ itemTotal: 1000, allocatedAmount: 700, remainingAmount: 0 }),
    ]);
    expect(receipt.totalPaid).toBe(750);
    expect(receipt.remainingBalance).toBe(-50);
  });

  it("includes free items with 0 allocated and 0 remaining", () => {
    const invoice = createInvoice(
      [
        { description: "Welcome Kit", quantity: 1, unitPrice: 30, discountRate: 1 },
        { description: "Monthly Fee", quantity: 1, unitPrice: 500 },
      ],
      0.07,
    );
    const result = processPayment(invoice, 100, "cash");

    const receipt = generateReceipt(result.payment, result.invoice);

    expect(receipt.items[0]).toMatchObject({ itemTotal: 0, allocatedAmount: 0, remainingAmount: 0 });
    expect(receipt.items[1]).toMatchObject({ itemTotal: 535, allocatedAmount: 100, remainingAmount: 435 });
  });

  it("throws when the payment belongs to a different invoice", () => {
    const { payment } = processPayment(createScenarioOneInvoice(), 300, "cash");
    const otherInvoice = createScenarioOneInvoice();

    expectValidationError(
      () => generateReceipt(payment, otherInvoice),
      `Cannot generate receipt: payment ${payment.id} belongs to invoice ${payment.invoiceId}, not to invoice ${otherInvoice.id}`,
    );
  });

  it("throws when given the invoice from before the payment instead of the returned one", () => {
    const originalInvoice = createScenarioOneInvoice();
    const { payment } = processPayment(originalInvoice, 300, "cash");

    expectValidationError(
      () => generateReceipt(payment, originalInvoice),
      `Cannot generate receipt: invoice ${originalInvoice.id} does not include payment ${payment.id}. Pass the invoice returned by processPayment for this payment`,
    );
  });

  it("throws when the payment amount is invalid", () => {
    const result = processPayment(createScenarioOneInvoice(), 300, "cash");
    const brokenPayment: Payment = { ...result.payment, amount: -300 };

    expectValidationError(
      () => generateReceipt(brokenPayment, result.invoice),
      "payment.amount must be greater than 0, received -300",
    );
  });

  it("gives every receipt a different receiptNumber, even for the same payment", () => {
    const first = processPayment(createScenarioOneInvoice(), 300, "cash");
    const second = processPayment(first.invoice, 289.57, "bank_transfer");

    const receiptNumbers = [
      generateReceipt(first.payment, first.invoice).receiptNumber,
      generateReceipt(second.payment, second.invoice).receiptNumber,
      generateReceipt(second.payment, second.invoice).receiptNumber,
    ];

    expect(new Set(receiptNumbers).size).toBe(3);
  });

  it("does not modify the payment or the invoice", () => {
    const result = processPayment(createScenarioOneInvoice(), 300, "cash");
    const paymentSnapshot = structuredClone(result.payment);
    const invoiceSnapshot = structuredClone(result.invoice);

    generateReceipt(result.payment, result.invoice);

    expect(result.payment).toEqual(paymentSnapshot);
    expect(result.invoice).toEqual(invoiceSnapshot);
  });
});
