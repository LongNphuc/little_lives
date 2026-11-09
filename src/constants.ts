import { PaymentMethod } from "./types";

export const MAX_AMOUNT = 1_000_000_000;

export const GST_RATE = 0.07;

export const PAYMENT_METHODS: readonly PaymentMethod[] = ["cash", "bank_transfer"];
