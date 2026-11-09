import { calculateInvoiceTotal, createInvoice, GST_RATE } from "../src";
import { expectValidationError } from "./helpers";

const scenarioItems = [
  { description: "Monthly Fee", quantity: 1, unitPrice: 500.0 },
  { description: "Activity Fee", quantity: 2, unitPrice: 25.5 },
];
const taxRate = 0.07;

describe("Scenario 1: Basic invoice calculation", () => {
  it("calculates subtotal 551.00, tax 38.57 and total 589.57", () => {
    const totals = calculateInvoiceTotal(scenarioItems, taxRate);

    expect(totals.subtotal).toBe(551.0);
    expect(totals.totalTax).toBe(38.57);
    expect(totals.totalAmount).toBe(589.57);
  });

  it("calculates lineTotal (quantity x unitPrice) and taxAmount for every item", () => {
    const totals = calculateInvoiceTotal(scenarioItems, taxRate);

    expect(totals.items).toHaveLength(2);
    expect(totals.items[0]).toMatchObject({
      description: "Monthly Fee",
      quantity: 1,
      unitPrice: 500,
      lineTotal: 500,
      taxRate: 0.07,
      taxAmount: 35,
    });
    expect(totals.items[1]).toMatchObject({
      description: "Activity Fee",
      quantity: 2,
      unitPrice: 25.5,
      lineTotal: 51,
      taxRate: 0.07,
      taxAmount: 3.57,
    });
  });

  it("gives every calculated item its own id", () => {
    const totals = calculateInvoiceTotal(scenarioItems, taxRate);
    const ids = totals.items.map((item) => item.id);

    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not modify the input items (works with frozen input)", () => {
    const frozenItems = Object.freeze(scenarioItems.map((item) => Object.freeze({ ...item })));

    const totals = calculateInvoiceTotal(frozenItems, taxRate);

    expect(totals.items[0]).not.toBe(frozenItems[0]);
    expect(frozenItems).toEqual(scenarioItems);
  });

  it("exposes the 7% GST rate as a constant", () => {
    expect(GST_RATE).toBe(0.07);
    expect(calculateInvoiceTotal(scenarioItems, GST_RATE).totalAmount).toBe(589.57);
  });
});

describe("Scenario 1: createInvoice", () => {
  it("builds an UNPAID invoice whose outstandingAmount equals totalAmount", () => {
    const invoice = createInvoice(scenarioItems, taxRate, "INV-1001");

    expect(invoice).toMatchObject({
      invoiceNumber: "INV-1001",
      totalAmount: 589.57,
      totalTax: 38.57,
      outstandingAmount: 589.57,
      status: "UNPAID",
    });
    expect(invoice.items).toHaveLength(2);
    expect(invoice.invoiceDate).toBeInstanceOf(Date);
  });

  it("generates a unique id and invoice number when none is given", () => {
    const first = createInvoice(scenarioItems, taxRate);
    const second = createInvoice(scenarioItems, taxRate);

    expect(first.invoiceNumber).toMatch(/^INV-/);
    expect(first.id).not.toBe(second.id);
    expect(first.invoiceNumber).not.toBe(second.invoiceNumber);
  });

  it("rejects a blank invoice number", () => {
    expectValidationError(
      () => createInvoice(scenarioItems, taxRate, "   "),
      'invoiceNumber must be a non-empty string, received "   "',
    );
  });
});

describe("Scenario 1: Rounding with integer cents", () => {
  it("0.1 x 3 is exactly 0.30", () => {
    const totals = calculateInvoiceTotal([{ description: "Pencil", quantity: 3, unitPrice: 0.1 }], 0);

    expect(totals.items[0].lineTotal).toBe(0.3);
    expect(totals.totalAmount).toBe(0.3);
  });

  it("0.1 + 0.2 is exactly 0.30", () => {
    const totals = calculateInvoiceTotal(
      [
        { description: "Eraser", quantity: 1, unitPrice: 0.1 },
        { description: "Ruler", quantity: 1, unitPrice: 0.2 },
      ],
      0,
    );

    expect(totals.subtotal).toBe(0.3);
    expect(totals.totalAmount).toBe(0.3);
  });

  it("rounds tax per line to the nearest cent, half up, then sums the lines", () => {
    const totals = calculateInvoiceTotal(
      [
        { description: "Sticker A", quantity: 1, unitPrice: 0.5 },
        { description: "Sticker B", quantity: 1, unitPrice: 0.5 },
      ],
      0.07,
    );

    expect(totals.items.map((item) => item.taxAmount)).toEqual([0.04, 0.04]);
    expect(totals.totalTax).toBe(0.08);
    expect(totals.totalAmount).toBe(1.08);
  });

  it("applies discountRate before tax", () => {
    const totals = calculateInvoiceTotal(
      [{ description: "Sibling Discount Fee", quantity: 1, unitPrice: 100, discountRate: 0.1 }],
      0.07,
    );

    expect(totals.items[0]).toMatchObject({ lineTotal: 90, taxAmount: 6.3, discountRate: 0.1 });
    expect(totals.totalAmount).toBe(96.3);
  });

  it("rounds a true half cent up even when floating point gives 16.4999...", () => {
    const totals = calculateInvoiceTotal(
      [{ description: "Promo Item", quantity: 1, unitPrice: 0.25, discountRate: 0.34 }],
      0,
    );

    expect(totals.items[0].lineTotal).toBe(0.17);
  });

  it("supports fractional quantities such as 1.5 hours", () => {
    const totals = calculateInvoiceTotal([{ description: "Extra Care (hours)", quantity: 1.5, unitPrice: 40 }], 0.07);

    expect(totals.subtotal).toBe(60);
    expect(totals.totalTax).toBe(4.2);
    expect(totals.totalAmount).toBe(64.2);
  });
});
