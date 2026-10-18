export interface DateChip {
  /** yyyy-MM-dd */
  iso: string
  /** "Mon" */
  weekday: string
  /** "12" */
  day: string
  marked: boolean
  selected: boolean
  isToday: boolean
}

export const CHIP_COUNT = 7

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

/**
 * The seven days ending today, or ending a few days after the selected date
 * when that date is older, so the selected day is always one of the chips.
 * Dates are calendar days: everything is computed in UTC to avoid a day shift.
 */
export function chipWindow(selected: string, today: string, count = CHIP_COUNT): string[] {
  const start = addDays(today, -(count - 1))
  const end = selected < start ? (addDays(selected, count - 1) < today ? addDays(selected, count - 1) : today) : today
  return Array.from({ length: count }, (_, i) => addDays(end, i - (count - 1)))
}

export function buildDateChips(
  selected: string,
  today: string,
  markedDates: ReadonlySet<string>,
  count = CHIP_COUNT,
): DateChip[] {
  return chipWindow(selected, today, count).map((iso) => ({
    iso,
    weekday: new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
      weekday: 'short',
      timeZone: 'UTC',
    }),
    day: String(Number(iso.slice(8, 10))),
    marked: markedDates.has(iso),
    selected: iso === selected,
    isToday: iso === today,
  }))
}
