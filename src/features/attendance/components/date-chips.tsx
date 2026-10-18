import Link from 'next/link'
import { buildDateChips } from '../date-chips'

/**
 * Weekday-plus-date chips ("Mon 12"), with a dot on days that already have a
 * register. Each is a link, so the day is in the URL like everything else here.
 */
export function DateChips({
  streamId,
  selected,
  today,
  markedDates,
}: {
  streamId: string
  selected: string
  today: string
  markedDates: ReadonlySet<string>
}) {
  const chips = buildDateChips(selected, today, markedDates)

  return (
    <nav aria-label="Recent days" className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <Link
          key={chip.iso}
          href={`/attendance?stream=${streamId}&date=${chip.iso}`}
          aria-current={chip.selected ? 'date' : undefined}
          className={`relative flex min-w-12 flex-col items-center rounded-xl border px-2 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
            chip.selected
              ? 'border-primary bg-primary font-medium text-primary-foreground'
              : 'border-border text-muted-foreground hover:bg-accent'
          }`}
        >
          <span>{chip.weekday}</span>
          <span className="text-sm font-medium tabular-nums">{chip.day}</span>
          {chip.marked && (
            <>
              <span
                aria-hidden="true"
                className={`mt-0.5 size-1.5 rounded-full ${chip.selected ? 'bg-primary-foreground' : 'bg-primary'}`}
              />
              <span className="sr-only">Register marked</span>
            </>
          )}
          {!chip.marked && <span aria-hidden="true" className="mt-0.5 size-1.5" />}
        </Link>
      ))}
    </nav>
  )
}
