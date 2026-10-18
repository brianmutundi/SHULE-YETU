import Link from 'next/link'
import { getSessionContext } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import { getSheet, getStreamOptions } from '@/features/attendance/queries'
import { attendanceQuerySchema } from '@/features/attendance/schema'
import { MarkingSheet } from '@/features/attendance/components/marking-sheet'
import { StreamPicker } from '@/features/attendance/components/stream-picker'

// Auth-dependent, so it cannot be prerendered.
export const instant = false

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getSessionContext()
  const raw = await searchParams

  // Today in the tenant's timezone, not UTC: a school in Nairobi marking at
  // 7am should not land on yesterday's sheet.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
  }).format(new Date())

  const parsed = attendanceQuerySchema.safeParse({
    streamId: typeof raw.stream === 'string' ? raw.stream : undefined,
    date: typeof raw.date === 'string' ? raw.date : undefined,
  })

  const date = parsed.success && parsed.data.date ? parsed.data.date : today
  const streams = await getStreamOptions()

  // A teacher lands on their own class rather than an empty screen.
  const requestedId = parsed.success ? parsed.data.streamId : ''
  const selectedId =
    requestedId || (streams.find((s) => s.canMark) ?? streams[0])?.id || ''

  const selected = streams.find((s) => s.id === selectedId) ?? null
  const sheet = selected ? await getSheet(selected.id, date) : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
        <p className="text-muted-foreground">
          Mark a class for a day. Saves as one batch.
        </p>
      </div>

      {streams.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No streams exist for the current academic year. Create them on the{' '}
          <Link href="/transitions" className="underline underline-offset-4">
            Transitions
          </Link>{' '}
          page first.
        </p>
      ) : (
        <div className="space-y-6">
          <StreamPicker
            streams={streams}
            selectedId={selectedId}
            date={date}
            canMarkAnywhere={can(session.role, 'attendance.mark')}
          />

          {selected && sheet && (
            <MarkingSheet
              stream={selected}
              date={date}
              rows={sheet.rows}
              canMark={sheet.canMark && can(session.role, 'attendance.mark')}
              isMarked={sheet.isMarked}
            />
          )}
        </div>
      )}
    </div>
  )
}