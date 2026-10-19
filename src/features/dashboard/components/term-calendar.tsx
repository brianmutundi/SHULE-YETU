import { buildMonthGrid, termMarkers } from '../calendar'
import { ChartCard } from './chart-card'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const MARKER_STYLE = {
  opens: 'bg-chip-status text-chip-status-foreground',
  midterm: 'bg-chip-warning text-chip-warning-foreground',
  closes: 'bg-chip-class text-chip-class-foreground',
} as const

const MARKER_LABEL = { opens: 'Term opens', midterm: 'Mid-term break', closes: 'Term closes' } as const

/** This month, with today highlighted and the term's opening, break and closing days marked. */
export function TermCalendar({
  today,
  term,
}: {
  today: string
  term: { openedOn: string; midtermBreakOn: string | null; closingOn: string } | null
}) {
  const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1]
  const weeks = buildMonthGrid(year, month)
  const markers = term ? termMarkers(term) : new Map()
  const title = new Date(Date.UTC(year, month, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <ChartCard title="Calendar">
      <p className="mb-2 text-sm font-medium">{title}</p>
      <table className="w-full text-center text-sm">
        <thead>
          <tr>
            {WEEKDAYS.map((d) => (
              <th key={d} scope="col" className="pb-1 text-xs font-normal text-muted-foreground">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0].iso}>
              {week.map((day) => {
                const marker = markers.get(day.iso) as keyof typeof MARKER_STYLE | undefined
                const isToday = day.iso === today
                return (
                  <td key={day.iso} className="p-0.5">
                    <span
                      aria-label={
                        marker ? `${day.day}, ${MARKER_LABEL[marker]}` : isToday ? `${day.day}, today` : undefined
                      }
                      aria-current={isToday ? 'date' : undefined}
                      className={`mx-auto flex size-8 items-center justify-center rounded-full tabular-nums ${
                        isToday
                          ? 'bg-primary font-medium text-primary-foreground'
                          : marker
                            ? MARKER_STYLE[marker]
                            : day.inMonth
                              ? ''
                              : 'text-muted-foreground/40'
                      }`}
                    >
                      {day.day}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {term && (
        <ul role="list" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {(Object.keys(MARKER_LABEL) as (keyof typeof MARKER_LABEL)[]).map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`size-2.5 rounded-full ${MARKER_STYLE[k]}`} />
              {MARKER_LABEL[k]}
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  )
}
