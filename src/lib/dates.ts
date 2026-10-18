import { format, isValid, parseISO } from 'date-fns'

/**
 * "12 Oct 2026" from a yyyy-MM-dd date or an ISO timestamp.
 *
 * Date-only values are calendar days with no time zone, so they are parsed as
 * local dates and printed the same way: no day shift. Returns the fallback
 * for null or unparseable input rather than throwing in a render path.
 */
export function formatDate(value: string | null | undefined, fallback = 'Not recorded'): string {
  if (!value) return fallback
  const parsed = parseISO(value)
  return isValid(parsed) ? format(parsed, 'd MMM yyyy') : fallback
}

/** Today as yyyy-MM-dd in the school's time zone (CLAUDE.md: Africa/Nairobi). */
export function todayInNairobi(now: Date = new Date()): string {
  // The en-CA locale prints ISO order (yyyy-MM-dd).
  return now.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' })
}
