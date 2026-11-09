export type PaymentMethod = "cash" | "bank_transfer";

export type InvoiceStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERPAID";

export type PaymentStatus = "COMPLETED";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  items: InvoiceItem[];
  totalAmount: number;
  totalTax: number;
  outstandingAmount: number;
  status: InvoiceStatus;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  taxRate: number;
  taxAmount: number;
  discountRate?: number;
}

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  discountRate?: number;
}

export interface InvoiceTotals {
  items: InvoiceItem[];
  subtotal: number;
  totalTax: number;
  totalAmount: number;
}

export interface Payment {
  id: string;
  invoiceId: string;
  paymentMethod: PaymentMethod;
  amount: number;
  paymentDate: Date;
  referenceNumber: string;
  status: PaymentStatus;
}

export interface PaymentResult {
  invoice: Invoice;
  payment: Payment;
  overpaymentAmount: number;
}

export interface Receipt {
  id: string;
  paymentId: string;
  receiptNumber: string;
  receiptDate: Date;
  totalPaid: number;
  remainingBalance: number;
  items: ReceiptItem[];
}

export interface ReceiptItem {
  itemId: string;
  description: string;
  itemTotal: number;
  allocatedAmount: number;
  remainingAmount: number;
}
