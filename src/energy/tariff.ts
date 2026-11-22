/*
 * Hungarian residential electricity prices (A1 tariff, universal service), gross, estimated for 2026. Sources checked in
 * Nov 2026: the discounted band is 2523 kWh / year (about 210 kWh / month) at about 36.9 Ft/kWh, consumption above it at the
 * market price (about 70.1 Ft/kWh); under gross settlement (bruttó elszámolás) fed-in energy earns about 5 Ft/kWh.
 * Kept in one place so an installer can change them per customer.
 */

export interface Tariff {
  /** Discounted quota per month (kWh) */
  quotaKwh: number
  /** Price within the quota (Ft/kWh) */
  low: number
  /** Price above the quota (Ft/kWh) */
  high: number
  /** Feed-in price (Ft/kWh) */
  feedIn: number
}

export const HU_2026: Tariff = { quotaKwh: 2523 / 12, low: 36.9, high: 70.1, feedIn: 5 }

/** Monthly bill for grid energy bought (Ft) */
export function monthlyCost(kwh: number, tariff: Tariff = HU_2026) {
  return Math.min(kwh, tariff.quotaKwh) * tariff.low + Math.max(0, kwh - tariff.quotaKwh) * tariff.high
}

export interface MonthEstimate {
  /** Bill if every kWh came from the grid */
  without: number
  /** Bill with the system: grid energy bought minus feed-in income */
  with: number
  saving: number
  /** Grid energy bought in a month like this day (kWh) */
  importKwh: number
  /** Consumption in a month like this day (kWh) */
  loadKwh: number
}

/** A month made of days like the given one (30 days) */
export function monthFromDay(day: { load: number; imported: number; exported: number }, tariff: Tariff = HU_2026): MonthEstimate {
  const loadKwh = day.load * 30
  const importKwh = day.imported * 30
  const without = monthlyCost(loadKwh, tariff)
  const withSys = monthlyCost(importKwh, tariff) - day.exported * 30 * tariff.feedIn
  return { without, with: withSys, saving: without - withSys, importKwh, loadKwh }
}
