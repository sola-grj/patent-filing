import Decimal from "decimal.js";

export type MoneyValue = Decimal.Value;

export function roundMoney(value: MoneyValue) {
  return decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

export function sumMoney(values: Iterable<MoneyValue>) {
  let total = new Decimal(0);
  for (const value of values) {
    total = total.plus(decimal(value));
  }
  return roundMoney(total);
}

export function multiplyMoney(value: MoneyValue, multiplier: MoneyValue) {
  return roundMoney(decimal(value).times(decimal(multiplier)));
}

export function divideMoney(value: MoneyValue, divisor: MoneyValue) {
  const normalizedDivisor = decimal(divisor);
  if (normalizedDivisor.isZero()) {
    throw new Error("Money values cannot be divided by zero.");
  }
  return roundMoney(decimal(value).dividedBy(normalizedDivisor));
}

function decimal(value: MoneyValue) {
  const result = new Decimal(value);
  if (!result.isFinite()) {
    throw new Error("Money values must be finite.");
  }
  return result;
}
