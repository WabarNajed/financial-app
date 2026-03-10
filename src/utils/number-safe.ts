/**
 * Central numeric safety helpers.
 *
 * PostgreSQL DECIMAL/NUMERIC columns are returned as strings by pg/knex.
 * These helpers ensure safe conversion before any arithmetic or formatting.
 */

/**
 * Safely convert any value to a number.
 * Handles: string, null, undefined, NaN, Infinity.
 */
export function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

/**
 * Convert to number and round to 2 decimal places (money).
 */
export function toMoney(value: unknown, fallback = 0): number {
  return round2(toNumber(value, fallback));
}

/**
 * Convert to number and round to 4 decimal places (percentages/rates).
 */
export function toPercent(value: unknown, fallback = 0): number {
  return round4(toNumber(value, fallback));
}

/**
 * Safe division — returns fallback when denominator is 0, null, or non-finite.
 */
export function safeDivide(numerator: unknown, denominator: unknown, fallback = 0): number {
  const n = toNumber(numerator);
  const d = toNumber(denominator);
  if (d === 0) return fallback;
  return n / d;
}

/**
 * Round to 2 decimal places.
 */
export function round2(value: unknown): number {
  return Math.round(toNumber(value) * 100) / 100;
}

/**
 * Round to 4 decimal places.
 */
export function round4(value: unknown): number {
  return Math.round(toNumber(value) * 10000) / 10000;
}

/**
 * Round to 1 decimal place.
 */
export function round1(value: unknown): number {
  return Math.round(toNumber(value) * 10) / 10;
}

/**
 * Format a number for display with fixed decimals, safe against strings/null.
 * Use ONLY for API/UI output — never for DB writes.
 */
export function fmt(value: unknown, decimals = 2): string {
  return toNumber(value).toFixed(decimals);
}

/**
 * Normalize a campaign row read from PostgreSQL.
 * Converts all DECIMAL string columns to real JS numbers.
 */
export function normalizeCampaignRow(row: any): any {
  if (!row) return row;
  return {
    ...row,
    budget: toNumber(row.budget),
    impressions: toNumber(row.impressions),
    clicks: toNumber(row.clicks),
    ctr: toNumber(row.ctr),
    cpc: toNumber(row.cpc),
    conversions: toNumber(row.conversions),
    cpa: toNumber(row.cpa),
    roas: toNumber(row.roas),
  };
}
