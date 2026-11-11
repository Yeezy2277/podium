/**
 * Money is integer minor units + ISO 4217 code. Never floats: 0.1 + 0.2 is not
 * a rounding problem you want in a prize table.
 */

/** Minor units per major unit for a currency (JPY → 0, USD → 2, KWD → 3). */
export function minorDigits(currency: string): number {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function formatMoney(amountMinor: number, currency: string, locale = "en-US"): string {
  const digits = minorDigits(currency);
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: digits }).format(
    amountMinor / 10 ** digits,
  );
}

/**
 * "12.50" → 1250 for USD. Parses the admin's input as a decimal string, so a
 * value like "19.99" never passes through float multiplication errors.
 */
export function parseMoney(input: string, currency: string): number {
  const digits = minorDigits(currency);
  const m = /^\s*(\d+)(?:[.,](\d+))?\s*$/.exec(input);
  if (!m) throw new Error(`"${input}" is not an amount`);
  const fraction = m[2] ?? "";
  if (fraction.length > digits) throw new Error(`${currency} has ${digits} decimal places`);
  return Number(m[1]) * 10 ** digits + Number(fraction.padEnd(digits, "0") || "0");
}
