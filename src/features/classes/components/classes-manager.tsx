'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import type { ClassRow } from '../queries'
import type { YearOption } from '@/lib/auth/period'
import { deleteStream, seedDefaultStreams } from '../actions'
import { CloneStreamsDialog } from './clone-streams-dialog'
import { CreateStreamDialog } from './create-stream-dialog'
import { EditStreamLabelDialog } from './edit-stream-label-dialog'

function Submit({
  children,
  disabled,
  ...rest
}: { children: React.ReactNode; disabled?: boolean } & Record<string, unknown>) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending || disabled} {...rest}>
      {pending ? 'Working...' : children}
    </Button>
  )
}

export function ClassesManager({
  classes,
  years,
  selectedYearId,
  calendarYear,
  canManage,
}: {
  classes: ClassRow[]
  years: YearOption[]
  selectedYearId: string | null
  /** The selected year, shown in the Year column. */
  calendarYear: number | null
  canManage: boolean
}) {
  const [seedState, seedAction] = useActionState(seedDefaultStreams, null)


  return (
    <div className="space-y-6">
      {seedState && !seedState.ok && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{seedState.error}</AlertDescription>
        </Alert>
      )}

      {canManage && (
        <div className="flex flex-wrap justify-end gap-2">
          <CloneStreamsDialog years={years} />
          <CreateStreamDialog
            classes={classes.map((c) => ({ id: c.id, label: c.label }))}
            academicYearId={selectedYearId}
          />
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">Classes and streams</caption>
          <thead className="border-b border-border bg-surface-2 text-left">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Label</th>
              <th scope="col" className="px-4 py-2 font-medium">Stream</th>
              <th scope="col" className="px-4 py-2 font-medium">Full Name</th>
              <th scope="col" className="px-4 py-2 font-medium">Level</th>
              <th scope="col" className="px-4 py-2 font-medium">Year</th>
              {canManage && (
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {classes.flatMap((row) =>
              row.streams.length === 0
                ? [
                    <tr key={row.id}>
                      <td className="px-4 py-2 font-medium">{row.label}</td>
                      <td className="px-4 py-2 text-muted-foreground" colSpan={2}>
                        No streams yet
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{row.stageName}</td>
                      <td className="px-4 py-2 text-muted-foreground">{calendarYear ?? '-'}</td>
                      {canManage && <td className="px-4 py-2" />}
                    </tr>,
                  ]
                : row.streams.map((stream) => (
                    <tr key={stream.id}>
                      <td className="px-4 py-2 font-medium">{row.label}</td>
                      <td className="px-4 py-2">
                        <Badge variant="secondary">{stream.label}</Badge>
                      </td>
                      <td className="px-4 py-2">{stream.fullName}</td>
                      <td className="px-4 py-2 text-muted-foreground">{row.stageName}</td>
                      <td className="px-4 py-2 text-muted-foreground">{calendarYear ?? '-'}</td>
                      <td className="px-4 py-2 text-right">
                        {canManage && (
                          <div className="flex items-start justify-end gap-1">
                            <EditStreamLabelDialog
                              streamId={stream.id}
                              classLabel={row.label}
                              streamLabel={stream.label}
                            />
                            <DeleteStreamButton
                              streamId={stream.id}
                              streamLabel={`${row.label} ${stream.label}`}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  )),
            )}
          </tbody>
        </table>
      </div>

      {canManage && (
        <>
          <section className="space-y-3 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold">Seed A and B streams</h2>
            <p className="text-xs text-muted-foreground">
              Adds A and B to every class for the selected academic year, skipping any that already
              exist.
            </p>
            <form action={seedAction}>
              <input type="hidden" name="academicYearId" value={selectedYearId ?? ''} />
              <Submit disabled={!selectedYearId}>
                {seedState?.ok ? `Added ${seedState.created ?? 0} streams` : 'Seed streams'}
              </Submit>
            </form>
          </section>

        </>
      )}
    </div>
  )
}

/**
 * Stream delete.
 *
 * A stream that still has learners is refused by the database, so the reason is
 * shown here rather than the delete appearing to succeed.
 */
export function DeleteStreamButton({
  streamId,
  streamLabel,
}: {
  streamId: string
  streamLabel: string
}) {
  const [state, action, pending] = useActionState(deleteStream, null)

  return (
    <div className="space-y-1">
      <form action={action}>
        <input type="hidden" name="streamId" value={streamId} />
        <Submit
          disabled={pending}
          aria-label={`Delete stream ${streamLabel}`}
        >
          {pending ? 'Deleting...' : 'Delete'}
        </Submit>
      </form>
      {state && !state.ok && (
        <p className="max-w-48 text-xs text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </div>
  )
}