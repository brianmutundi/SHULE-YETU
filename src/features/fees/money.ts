/**
 * Money is integer minor units (KES cents) everywhere except the edge. These
 * two functions are the edge: format for display, parse what a person typed.
 * No floating point touches an amount.
 */

/** "KES 12,500.00". Negative amounts (reversals) print as "-KES 500.00". */
export function formatMoney(minor: number, currency = 'KES'): string {
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(minor))
  const whole = Math.floor(abs / 100)
  const cents = String(abs % 100).padStart(2, '0')
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}${currency} ${grouped}.${cents}`
}

/** Largest single payment accepted from the form: KES 10,000,000. Catches typos. */
export const MAX_PAYMENT_MINOR = 10_000_000 * 100

/**
 * Parse "12500", "12,500.5", "KES 12,500.00" into minor units.
 * Returns null for anything else: negatives, three decimals, text, empty.
 */
export function parseMoneyToMinor(input: string): number | null {
  const cleaned = input.trim().replace(/^kes\s*/i, '').replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null

  const [whole, fraction = ''] = cleaned.split('.')
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))

  return Number.isSafeInteger(minor) ? minor : null
}
