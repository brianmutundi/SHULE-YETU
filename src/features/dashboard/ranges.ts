/** Date ranges for the payments chart and the transactions drawer. */
export const RANGES = ['7d', '30d', '90d', 'term'] as const
export type Range = (typeof RANGES)[number]
export const DEFAULT_RANGE: Range = '30d'

export const RANGE_LABELS: Record<Range, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  term: 'This term',
}

export type Bucket = 'day' | 'week' | 'month'

export function parseRange(raw: string | null | undefined): Range {
  return RANGES.find((r) => r === raw) ?? DEFAULT_RANGE
}

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Resolve a range to inclusive dates and a chart bucket. All yyyy-MM-dd, all
 * calendar days, so there is no time zone to shift them.
 *
 * "term" runs from the term's opening to today, or to its closing if that has
 * passed, and is clamped to 400 days because the database refuses longer.
 */
export function rangeDates(
  range: Range,
  today: string,
  term: { openedOn: string; closingOn: string } | null,
): { from: string; to: string; bucket: Bucket } {
  switch (range) {
    case '7d':
      return { from: shift(today, -6), to: today, bucket: 'day' }
    case '30d':
      return { from: shift(today, -29), to: today, bucket: 'day' }
    case '90d':
      return { from: shift(today, -89), to: today, bucket: 'week' }
    case 'term': {
      if (!term) return { from: shift(today, -89), to: today, bucket: 'week' }
      const to = term.closingOn < today ? term.closingOn : today
      // A term that has not opened yet shows its opening day only.
      const from = term.openedOn > to ? to : term.openedOn
      const floor = shift(to, -399)
      return { from: from < floor ? floor : from, to, bucket: 'week' }
    }
  }
}
