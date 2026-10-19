export interface CalendarDay {
  iso: string
  day: number
  inMonth: boolean
}

/**
 * A month as weeks, Monday first (the Kenyan school week). Days from the
 * neighbouring months pad the first and last week and are flagged inMonth=false.
 * month is 0-based, as in Date.
 */
export function buildMonthGrid(year: number, month: number): CalendarDay[][] {
  const first = new Date(Date.UTC(year, month, 1))
  // getUTCDay: Sunday = 0. Shift so Monday = 0.
  const lead = (first.getUTCDay() + 6) % 7
  const start = new Date(Date.UTC(year, month, 1 - lead))

  const weeks: CalendarDay[][] = []
  const cursor = new Date(start)

  do {
    const week: CalendarDay[] = []
    for (let i = 0; i < 7; i += 1) {
      week.push({
        iso: cursor.toISOString().slice(0, 10),
        day: cursor.getUTCDate(),
        inMonth: cursor.getUTCMonth() === month,
      })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    weeks.push(week)
  } while (cursor.getUTCMonth() === month)

  return weeks
}

export type TermMarker = 'opens' | 'midterm' | 'closes'

/** Which term dates fall on which calendar day. */
export function termMarkers(term: {
  openedOn: string
  midtermBreakOn: string | null
  closingOn: string
}): Map<string, TermMarker> {
  const markers = new Map<string, TermMarker>()
  markers.set(term.openedOn, 'opens')
  if (term.midtermBreakOn) markers.set(term.midtermBreakOn, 'midterm')
  markers.set(term.closingOn, 'closes')
  return markers
}
