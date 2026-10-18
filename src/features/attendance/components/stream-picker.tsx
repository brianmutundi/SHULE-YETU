import Link from 'next/link'
import type { StreamOption } from '../queries'

/**
 * Stream and date picker (CLAUDE.md section 7.11).
 *
 * A form with a GET submit rather than client state: the chosen stream and date
 * are the URL, so a teacher can bookmark a class, share it with a deputy, or
 * reload after marking without losing their place.
 *
 * The picker's own links carry the current date so switching class keeps the day
 * you were marking.
 */
export function StreamPicker({
  streams,
  selectedId,
  date,
  canMarkAnywhere,
}: {
  streams: StreamOption[]
  selectedId: string
  date: string
  canMarkAnywhere: boolean
}) {
  const markable = streams.filter((s) => s.canMark)
  const readOnly = streams.filter((s) => !s.canMark)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <form method="get" action="/attendance" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="stream" className="text-xs text-muted-foreground">
              Class
            </label>
            <select
              id="stream"
              name="stream"
              defaultValue={selectedId}
              className="h-9 rounded-md border border-border bg-transparent px-2 text-sm"
            >
              {streams.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                  {s.canMark ? '' : ' (view only)'}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="date" className="text-xs text-muted-foreground">
              Date
            </label>
            <input
              id="date"
              name="date"
              type="date"
              defaultValue={date}
              className="h-9 rounded-md border border-border bg-transparent px-2 text-sm"
            />
          </div>

          <button
            type="submit"
            className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground"
          >
            Show
          </button>
        </form>

        {/* Recent days, so marking yesterday after a late register is one click. */}
        <div className="flex flex-wrap gap-1">
          {[0, 1, 2].map((offset) => {
            const d = new Date(`${date}T00:00:00Z`)
            d.setUTCDate(d.getUTCDate() - offset)
            const iso = d.toISOString().slice(0, 10)
            const label = offset === 0 ? 'Today' : offset === 1 ? 'Yesterday' : iso.slice(5)

            return (
              <Link
                key={iso}
                href={`/attendance?stream=${selectedId}&date=${iso}`}
                className={`rounded-full border px-3 py-1 text-xs ${
                  iso === date
                    ? 'border-primary bg-primary/10 font-medium'
                    : 'border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </div>
      </div>

      {canMarkAnywhere && markable.length > 0 && (
        <nav aria-label="Classes you can mark" className="flex flex-wrap gap-1">
          {markable.map((s) => (
            <Link
              key={s.id}
              href={`/attendance?stream=${s.id}&date=${date}`}
              className={`rounded-full px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                s.id === selectedId
                  ? 'bg-primary font-medium text-primary-foreground'
                  : 'border border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      )}

      {readOnly.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {readOnly.length} other class{readOnly.length === 1 ? '' : 'es'} you can view
          </summary>
          <nav aria-label="Classes you can view" className="mt-2 flex flex-wrap gap-1">
            {readOnly.map((s) => (
              <Link
                key={s.id}
                href={`/attendance?stream=${s.id}&date=${date}`}
                className={`rounded-full px-3 py-1 text-sm ${
                  s.id === selectedId
                    ? 'bg-secondary font-medium'
                    : 'border border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                {s.label}
              </Link>
            ))}
          </nav>
        </details>
      )}
    </div>
  )
}