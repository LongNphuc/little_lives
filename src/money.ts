const CENTS_PER_UNIT = 100;

const SIGNIFICANT_DIGITS_WITHOUT_FLOAT_NOISE = 15;

export function roundHalfUp(value: number): number {
  return Math.round(Number(value.toPrecision(SIGNIFICANT_DIGITS_WITHOUT_FLOAT_NOISE)));
}

export function toCents(amount: number): number {
  return roundHalfUp(amount * CENTS_PER_UNIT);
}

export function fromCents(cents: number): number {
  return cents / CENTS_PER_UNIT;
}

export function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
