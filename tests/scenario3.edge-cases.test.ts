import { calculateInvoiceTotal, createInvoice, Invoice, InvoiceItemInput, MAX_AMOUNT, processPayment } from "../src";
import { asPaymentMethod, createServiceInvoice, expectValidationError, sumAmounts } from "./helpers";

const monthlyFee: InvoiceItemInput = { description: "Monthly Fee", quantity: 1, unitPrice: 500 };

function withMonthlyFee(overrides: Partial<InvoiceItemInput>): InvoiceItemInput[] {
  return [{ ...monthlyFee, ...overrides }];
}

describe("Scenario 3: Edge cases", () => {
  describe("Case 3: Zero-amount invoice", () => {
    it("an empty item list is valid and totals 0", () => {
      expect(calculateInvoiceTotal([], 0.07)).toEqual({ items: [], subtotal: 0, totalTax: 0, totalAmount: 0 });
    });

    it("an item with discountRate = 1 (free) has lineTotal 0, taxAmount 0 and total 0", () => {
      const totals = calculateInvoiceTotal(
        [{ description: "Welcome Kit", quantity: 1, unitPrice: 30, discountRate: 1 }],
        0.07,
      );

      expect(totals.items[0]).toMatchObject({ lineTotal: 0, taxAmount: 0, discountRate: 1 });
      expect(totals.subtotal).toBe(0);
      expect(totals.totalTax).toBe(0);
      expect(totals.totalAmount).toBe(0);
    });

    it("createInvoice marks a zero-total invoice as PAID with outstanding 0", () => {
      const invoice = createInvoice(
        [{ description: "Welcome Kit", quantity: 1, unitPrice: 30, discountRate: 1 }],
        0.07,
      );

      expect(invoice.totalAmount).toBe(0);
      expect(invoice.outstandingAmount).toBe(0);
      expect(invoice.status).toBe("PAID");
    });

    it("createInvoice with no items is also PAID", () => {
      expect(createInvoice([], 0.07).status).toBe("PAID");
    });

    it("rejects any payment on a zero-total invoice", () => {
      const invoice = createInvoice([], 0.07, "INV-ZERO");

      expectValidationError(
        () => processPayment(invoice, 10, "cash"),
        "Invoice is already fully paid or has nothing to pay: invoice INV-ZERO has outstandingAmount 0 and status PAID",
      );
    });
  });

  describe("Case 4: Negative and invalid values", () => {
    it.each(["", "   "])("rejects description %p", (description) => {
      expectValidationError(
        () => calculateInvoiceTotal(withMonthlyFee({ description }), 0.07),
        `Item #1: description must be a non-empty string, received "${description}"`,
      );
    });

    it.each([0, -1])("rejects quantity %p", (quantity) => {
      expectValidationError(
        () => calculateInvoiceTotal(withMonthlyFee({ quantity }), 0.07),
        `Item #1 ("Monthly Fee"): quantity must be greater than 0, received ${quantity}`,
      );
    });

    it.each([0, -25.5])("rejects unitPrice %p", (unitPrice) => {
      expectValidationError(
        () => calculateInvoiceTotal(withMonthlyFee({ unitPrice }), 0.07),
        `Item #1 ("Monthly Fee"): unitPrice must be greater than 0, received ${unitPrice}`,
      );
    });

    it.each([-0.1, 1.5])("rejects discountRate %p", (discountRate) => {
      expectValidationError(
        () => calculateInvoiceTotal(withMonthlyFee({ discountRate }), 0.07),
        `Item #1 ("Monthly Fee"): discountRate must be between 0 and 1 (a fraction, e.g. 0.07 for 7%), received ${discountRate}`,
      );
    });

    it.each([-0.07, 1.07, 7])("rejects taxRate %p", (taxRate) => {
      expectValidationError(
        () => calculateInvoiceTotal([monthlyFee], taxRate),
        `taxRate must be between 0 and 1 (a fraction, e.g. 0.07 for 7%), received ${taxRate}`,
      );
    });

    it.each([0, -100])("rejects paymentAmount %p", (paymentAmount) => {
      expectValidationError(
        () => processPayment(createServiceInvoice(1000), paymentAmount, "cash"),
        `paymentAmount must be greater than 0, received ${paymentAmount}`,
      );
    });

    it("rejects NaN and Infinity in item fields", () => {
      expectValidationError(
        () => calculateInvoiceTotal(withMonthlyFee({ quantity: NaN }), 0.07),
        'Item #1 ("Monthly Fee"): quantity must be a finite number, received NaN',
      );
      expectValidationError(
        () => calculateInvoiceTotal(withMonthlyFee({ unitPrice: Infinity }), 0.07),
        'Item #1 ("Monthly Fee"): unitPrice must be a finite number, received Infinity',
      );
      expectValidationError(
        () => calculateInvoiceTotal(withMonthlyFee({ discountRate: NaN }), 0.07),
        'Item #1 ("Monthly Fee"): discountRate must be a finite number, received NaN',
      );
    });

    it("rejects NaN taxRate", () => {
      expectValidationError(
        () => calculateInvoiceTotal([monthlyFee], NaN),
        "taxRate must be a finite number, received NaN",
      );
    });

    it.each([NaN, Infinity, -Infinity])("rejects paymentAmount %p", (paymentAmount) => {
      expectValidationError(
        () => processPayment(createServiceInvoice(1000), paymentAmount, "cash"),
        `paymentAmount must be a finite number, received ${paymentAmount}`,
      );
    });

    it.each(["card", "", "CASH"])("rejects paymentMethod %p", (paymentMethod) => {
      expectValidationError(
        () => processPayment(createServiceInvoice(1000), 100, asPaymentMethod(paymentMethod)),
        `paymentMethod must be one of: cash, bank_transfer, received "${paymentMethod}"`,
      );
    });

    it("rejects amounts with more than 2 decimal places instead of silently rounding", () => {
      expectValidationError(
        () => calculateInvoiceTotal(withMonthlyFee({ unitPrice: 10.005 }), 0.07),
        'Item #1 ("Monthly Fee"): unitPrice must have at most 2 decimal places, received 10.005',
      );
      expectValidationError(
        () => processPayment(createServiceInvoice(1000), 10.005, "cash"),
        "paymentAmount must have at most 2 decimal places, received 10.005",
      );
    });

    it("names the position and description of the failing item", () => {
      expectValidationError(
        () =>
          calculateInvoiceTotal(
            [monthlyFee, { description: "Activity Fee", quantity: -2, unitPrice: 25.5 }],
            0.07,
          ),
        'Item #2 ("Activity Fee"): quantity must be greater than 0, received -2',
      );
    });

    it("rejects values of the wrong type coming from untyped callers", () => {
      expectValidationError(
        () => calculateInvoiceTotal(null as unknown as InvoiceItemInput[], 0.07),
        "items must be an array, received null",
      );
      expectValidationError(
        () => calculateInvoiceTotal(withMonthlyFee({ unitPrice: "500" as unknown as number }), 0.07),
        'Item #1 ("Monthly Fee"): unitPrice must be a finite number, received "500"',
      );
    });
  });

  describe("Case 5: Very large amounts", () => {
    it("accepts an invoice whose total is exactly MAX_AMOUNT and can pay it in full", () => {
      const invoice = createInvoice([{ description: "Campus Purchase", quantity: 1, unitPrice: MAX_AMOUNT }], 0);

      expect(invoice.totalAmount).toBe(1_000_000_000);

      const result = processPayment(invoice, MAX_AMOUNT, "bank_transfer");
      expect(result.invoice.outstandingAmount).toBe(0);
      expect(result.invoice.status).toBe("PAID");
    });

    it("keeps cent precision right below the limit", () => {
      const invoice = createInvoice(
        [
          { description: "Campus Purchase", quantity: 1, unitPrice: 999_999_999.99 },
          { description: "Stamp", quantity: 1, unitPrice: 0.01 },
        ],
        0,
      );

      expect(invoice.totalAmount).toBe(1_000_000_000);

      const result = processPayment(invoice, 999_999_999.99, "bank_transfer");
      expect(result.invoice.outstandingAmount).toBe(0.01);
    });

    it("rejects an invoice whose total goes above MAX_AMOUNT once tax is added", () => {
      expectValidationError(
        () => calculateInvoiceTotal([{ description: "Campus Purchase", quantity: 1, unitPrice: MAX_AMOUNT }], 0.07),
        "Invoice total exceeds the maximum supported amount of 1000000000, received 1070000000",
      );
    });

    it("rejects an invoice that is 1 cent above MAX_AMOUNT", () => {
      expectValidationError(
        () =>
          calculateInvoiceTotal(
            [
              { description: "Campus Purchase", quantity: 1, unitPrice: 999_999_999.99 },
              { description: "Stamp", quantity: 1, unitPrice: 0.02 },
            ],
            0,
          ),
        "Invoice total exceeds the maximum supported amount of 1000000000, received 1000000000.01",
      );
    });

    it("rejects a single line whose quantity * unitPrice is above MAX_AMOUNT", () => {
      expectValidationError(
        () => calculateInvoiceTotal([{ description: "Annual Campus Fee", quantity: 2, unitPrice: 600_000_000 }], 0),
        'Item #1 ("Annual Campus Fee"): quantity * unitPrice must not exceed 1000000000, received 1200000000',
      );
    });

    it("rejects a huge quantity that would overflow to Infinity", () => {
      expectValidationError(
        () => calculateInvoiceTotal(withMonthlyFee({ quantity: Number.MAX_VALUE, discountRate: 1 }), 0),
        'Item #1 ("Monthly Fee"): quantity * unitPrice must not exceed 1000000000, received Infinity',
      );
    });

    it("rejects a paymentAmount above MAX_AMOUNT", () => {
      expectValidationError(
        () => processPayment(createServiceInvoice(1000), MAX_AMOUNT + 0.01, "cash"),
        "paymentAmount must not exceed 1000000000, received 1000000000.01",
      );
    });
  });

  describe("Case 6: Multiple payments for one invoice", () => {
    function payThreeTimes() {
      const invoice = createServiceInvoice(1000);
      const first = processPayment(invoice, 300, "cash");
      const second = processPayment(first.invoice, 200, "bank_transfer");
      const third = processPayment(second.invoice, 500, "cash");
      return { invoice, results: [first, second, third] };
    }

    it("updates outstanding to 700, 500, 0 when each returned invoice is passed to the next payment", () => {
      const { results } = payThreeTimes();

      expect(results.map((result) => result.invoice.outstandingAmount)).toEqual([700, 500, 0]);
    });

    it("moves the status PARTIALLY_PAID -> PARTIALLY_PAID -> PAID", () => {
      const { results } = payThreeTimes();

      expect(results.map((result) => result.invoice.status)).toEqual(["PARTIALLY_PAID", "PARTIALLY_PAID", "PAID"]);
    });

    it("rejects a 4th payment once the invoice is fully paid", () => {
      const { results } = payThreeTimes();
      const paidInvoice = results[2].invoice;

      expectValidationError(
        () => processPayment(paidInvoice, 1, "cash"),
        `Invoice is already fully paid or has nothing to pay: invoice ${paidInvoice.invoiceNumber} has outstandingAmount 0 and status PAID`,
      );
    });

    it("gives every payment a different id and referenceNumber", () => {
      const { results } = payThreeTimes();
      const referenceNumbers = results.map((result) => result.payment.referenceNumber);
      const paymentIds = results.map((result) => result.payment.id);

      expect(new Set(referenceNumbers).size).toBe(3);
      expect(new Set(paymentIds).size).toBe(3);
    });

    it("keeps total paid + outstanding = totalAmount after every payment", () => {
      const { invoice, results } = payThreeTimes();

      results.forEach((result, index) => {
        const paidSoFar = sumAmounts(results.slice(0, index + 1).map((each) => each.payment.amount));
        expect(sumAmounts([paidSoFar, result.invoice.outstandingAmount])).toBe(invoice.totalAmount);
      });
    });

    it("links every payment to the same invoice and leaves the original invoice untouched", () => {
      const { invoice, results } = payThreeTimes();

      expect(results.every((result) => result.payment.invoiceId === invoice.id)).toBe(true);
      expect(invoice.outstandingAmount).toBe(1000);
      expect(invoice.status).toBe("UNPAID");
    });
  });

  describe("Additional edge cases", () => {
    it("rejects a further payment on an OVERPAID invoice", () => {
      const overpaid = processPayment(createServiceInvoice(1000), 1050, "cash").invoice;

      expectValidationError(
        () => processPayment(overpaid, 10, "cash"),
        `Invoice is already fully paid or has nothing to pay: invoice ${overpaid.invoiceNumber} has outstandingAmount -50 and status OVERPAID`,
      );
    });

    it("reports an invalid amount before the invoice state", () => {
      const paidInvoice = processPayment(createServiceInvoice(1000), 1000, "cash").invoice;

      expectValidationError(
        () => processPayment(paidInvoice, -5, "cash"),
        "paymentAmount must be greater than 0, received -5",
      );
    });

    it("accepts a hand-built invoice that follows the Invoice interface", () => {
      const handBuiltInvoice: Invoice = {
        id: "inv-1",
        invoiceNumber: "INV-001",
        invoiceDate: new Date("2026-01-01"),
        items: [],
        totalAmount: 1000,
        totalTax: 0,
        outstandingAmount: 1000,
        status: "UNPAID",
      };

      const result = processPayment(handBuiltInvoice, 300, "cash");

      expect(result.invoice.outstandingAmount).toBe(700);
    });

    it("rejects an inconsistent invoice whose outstandingAmount is larger than totalAmount", () => {
      const inconsistentInvoice: Invoice = {
        ...createServiceInvoice(1000),
        outstandingAmount: 1200,
      };

      expectValidationError(
        () => processPayment(inconsistentInvoice, 100, "cash"),
        "invoice.outstandingAmount must not exceed invoice.totalAmount (1000), received 1200",
      );
    });

    it("rejects an invoice with a NaN outstandingAmount", () => {
      const brokenInvoice: Invoice = { ...createServiceInvoice(1000), outstandingAmount: NaN };

      expectValidationError(
        () => processPayment(brokenInvoice, 100, "cash"),
        "invoice.outstandingAmount must be a finite number, received NaN",
      );
    });

    it("trims surrounding spaces from descriptions", () => {
      const totals = calculateInvoiceTotal(withMonthlyFee({ description: "  Monthly Fee  " }), 0.07);

      expect(totals.items[0].description).toBe("Monthly Fee");
    });

    it("allows a tax rate of 0 and of 1 (the inclusive bounds)", () => {
      expect(calculateInvoiceTotal([monthlyFee], 0).totalAmount).toBe(500);
      expect(calculateInvoiceTotal([monthlyFee], 1).totalAmount).toBe(1000);
    });
  });
});
