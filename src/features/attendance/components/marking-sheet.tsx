'use client'

import { useActionState, useCallback, useEffect, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { saveAttendance } from '../actions'
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_LABELS,
  attendanceTone,
  EXCUSE_REASONS,
  EXCUSE_REASON_LABELS,
  GOOD_ATTENDANCE_RATE,
  type AttendanceStatus,
  type ExcuseReason,
  type SaveResult,
  type SheetRow,
} from '../schema'
import type { StreamOption } from '../queries'

/**
 * The marking sheet (CLAUDE.md section 7.11).
 *
 * Built for a teacher on a phone with no connection, which drives three
 * decisions that would otherwise look like over-engineering:
 *
 *   - Marks are held locally and saved as one batch. Nothing is written per
 *     learner, so a flaky connection costs one request, not forty.
 *   - A failed save keeps the marks and offers a retry. Losing a register
 *     because a request timed out is the worst outcome this screen has.
 *   - Leaving with unsaved marks warns first. A teacher who taps a link by
 *     accident should not silently discard an hour of marking.
 */

interface Draft {
  status: AttendanceStatus
  excuseReason: ExcuseReason | null
  note: string
}

const STATUS_TONE: Record<AttendanceStatus, string> = {
  present: 'bg-primary text-primary-foreground',
  absent: 'bg-destructive/15 text-destructive border-destructive/30',
  late: 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30',
  excused: 'bg-secondary text-secondary-foreground border-border',
}

function RateBar({ rate }: { rate: number | null }) {
  const tone = attendanceTone(rate)

  const bar =
    tone === 'good'
      ? 'bg-emerald-500'
      : tone === 'fair'
        ? 'bg-amber-500'
        : tone === 'poor'
          ? 'bg-destructive'
          : 'bg-muted'

  const label =
    rate === null
      ? 'No record yet'
      : `${rate}% attendance`

  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={label}
      >
        <div
          className={`h-full rounded-full ${bar}`}
          style={{ width: `${Math.min(100, Math.max(0, rate ?? 0))}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {rate === null ? '--' : `${rate}%`}
      </span>
    </div>
  )
}

function RowControl({
  row,
  draft,
  onChange,
  disabled,
}: {
  row: SheetRow
  draft: Draft | null
  onChange: (next: Draft) => void
  disabled: boolean
}) {
  const selected = draft?.status ?? row.status
  const reason = draft?.excuseReason ?? row.excuseReason
  const note = draft?.note ?? row.note ?? ''

  return (
    <li className="space-y-2 border-b border-border px-3 py-3 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{row.fullName}</p>
          <p className="font-mono text-xs text-muted-foreground">{row.studentNo}</p>
        </div>
        <RateBar rate={row.rate} />
      </div>

      <div role="radiogroup" aria-label={`Attendance for ${row.fullName}`} className="flex flex-wrap gap-1.5">
        {ATTENDANCE_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            role="radio"
            aria-checked={selected === status}
            disabled={disabled}
            onClick={() =>
              onChange({
                status,
                // Dropping a reason when the status changes stops "present, sick"
                // being stored, which the column constraint would reject anyway.
                excuseReason: status === 'excused' ? (reason ?? 'sick') : null,
                note,
              })
            }
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              selected === status
                ? STATUS_TONE[status]
                : 'border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            {ATTENDANCE_STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      {selected === 'excused' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Reason:</span>
          {EXCUSE_REASONS.map((value) => (
            <button
              key={value}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ status: 'excused', excuseReason: value, note })}
              className={`rounded-full border px-2.5 py-0.5 text-xs disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                reason === value
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground'
              }`}
            >
              {EXCUSE_REASON_LABELS[value]}
            </button>
          ))}
        </div>
      )}
    </li>
  )
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? 'Saving...' : 'Save register'}
    </Button>
  )
}

export function MarkingSheet({
  stream,
  date,
  rows,
  canMark,
  isMarked,
}: {
  stream: StreamOption
  date: string
  rows: SheetRow[]
  canMark: boolean
  isMarked: boolean
}) {
  const [state, action] = useActionState<SaveResult | null, FormData>(saveAttendance, null)
  const [online, setOnline] = useState(true)

  // Offline indicator. The register still marks; the save waits.
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    // Read once on mount to catch a page loaded while already offline. Deferred
    // so the setState is not synchronous inside the effect body.
    queueMicrotask(update)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  /**
   * The register is keyed on the save outcome, so a confirmed save remounts it
   * with empty drafts.
   *
   * Clearing the drafts from the parent's handler is not possible: the action
   * state belongs to the form, and the drafts belong to the register. Remounting
   * on a changed key is the way to reset child state from a parent, and it costs
   * one render rather than the two an effect-driven reset costs.
   */
  const saveKey =
    state?.ok && state.skipped === 0 ? `saved:${state.saved}:${state.outcomes.length}` : 'dirty'

  return (
    <>
      {!online && (
        <Alert>
          <AlertTitle>No connection</AlertTitle>
          <AlertDescription>
            Keep marking. Saving will fail until you are back online, and your marks stay
            on screen until then.
          </AlertDescription>
        </Alert>
      )}

      <Register
        key={saveKey}
        stream={stream}
        date={date}
        rows={rows}
        canMark={canMark}
        isMarked={isMarked}
        online={online}
        action={action}
        state={state}
      />
    </>
  )
}

/**
 * The marking register itself.
 *
 * Holds the unsaved marks. Remounted by the parent whenever a save is confirmed,
 * which is how the drafts reset without an effect.
 */
function Register({
  stream,
  date,
  rows,
  canMark,
  isMarked,
  online,
  action,
  state,
}: {
  stream: StreamOption
  date: string
  rows: SheetRow[]
  canMark: boolean
  isMarked: boolean
  online: boolean
  action: (payload: FormData) => void
  state: SaveResult | null
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

  const changed = useMemo(() => Object.keys(drafts), [drafts])

  const setDraft = useCallback((studentId: string, next: Draft) => {
    setDrafts((prev) => ({ ...prev, [studentId]: next }))
  }, [])

  const markAllPresent = () => {
    const next: Record<string, Draft> = {}
    for (const row of rows) {
      if (row.status !== 'present') {
        next[row.studentId] = { status: 'present', excuseReason: null, note: '' }
      }
    }
    setDrafts(next)
  }

  const entries = useMemo(
    () =>
      Object.entries(drafts).map(([studentId, draft]) => ({
        studentId,
        status: draft.status,
        excuseReason: draft.excuseReason ?? undefined,
        note: draft.note || undefined,
      })),
    [drafts],
  )

  // Warn before leaving with unsaved marks. A teacher who taps a link mid-
  // register should be asked, not silently lose an hour.
  useEffect(() => {
    if (changed.length === 0) return

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [changed.length])

  if (rows.length === 0) {
    return (
      <Alert>
        <AlertTitle>No learners in this class yet</AlertTitle>
        <AlertDescription>
          Enrol learners or import a register before marking attendance.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">{stream.label}</h2>
          {isMarked && <Badge variant="secondary">Marked</Badge>}
          {!online && <Badge variant="destructive">Offline</Badge>}
          {changed.length > 0 && (
            <Badge>
              {changed.length} unsaved
            </Badge>
          )}
        </div>

        {canMark && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={markAllPresent} disabled={changed.length === 0 && isMarked}>
              Mark all present
            </Button>
          </div>
        )}
      </div>

      <ul role="list" className="rounded-lg border border-border">
        {rows.map((row) => (
          <RowControl
            key={row.studentId}
            row={row}
            draft={drafts[row.studentId] ?? null}
            onChange={(next) => setDraft(row.studentId, next)}
            disabled={!canMark}
          />
        ))}
      </ul>

      {canMark && (
        <form action={action} className="space-y-3">
          <input type="hidden" name="streamId" value={stream.id} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="entries" value={JSON.stringify(entries)} />

          <div className="flex flex-wrap items-center gap-3">
            <SaveButton disabled={changed.length === 0} />
            {changed.length === 0 && (
              // Remounting on a confirmed save is what clears the drafts, so
              // reaching here means nothing is pending. The saved count comes
              // from state, never from a ref read during render.
              <span className="text-sm text-muted-foreground">
                {state?.ok
                  ? `Saved ${state.saved} mark${state.saved === 1 ? '' : 's'}.`
                  : 'Nothing changed since the last save.'}
              </span>
            )}
          </div>

          {state?.ok && (
            <Alert>
              <AlertTitle>
                {state.skipped === 0
                  ? `${state.saved} learner${state.saved === 1 ? '' : 's'} marked`
                  : `${state.saved} saved, ${state.skipped} not saved`}
              </AlertTitle>
              {state.skipped > 0 && (
                <AlertDescription>
                  <ul role="list" className="mt-1 space-y-0.5">
                    {state.outcomes.map((outcome) => (
                      <li key={outcome.studentId} className="text-sm">
                        {outcome.message}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              )}
            </Alert>
          )}

          {state && !state.ok && (
            <Alert variant="destructive">
              <AlertTitle>The register was not saved</AlertTitle>
              <AlertDescription>
                {state.error} Your marks are still on screen. Try saving again.
              </AlertDescription>
            </Alert>
          )}
        </form>
      )}

      {!canMark && (
        <Alert>
          <AlertTitle>Read only</AlertTitle>
          <AlertDescription>
            You are not the class teacher for this class, so you can view the register but
            not change it.
          </AlertDescription>
        </Alert>
      )}

      <p className="sr-only">{GOOD_ATTENDANCE_RATE}% and above counts as good attendance.</p>
    </div>
  )
}