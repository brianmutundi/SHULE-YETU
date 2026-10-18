'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ClassRow } from '../queries'
import type { YearOption } from '@/lib/auth/period'
import { cloneStreams, createStream, deleteStream, seedDefaultStreams } from '../actions'

function Submit({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending || disabled}>
      {pending ? 'Working...' : children}
    </Button>
  )
}

export function ClassesManager({
  classes,
  years,
  selectedYearId,
  canManage,
}: {
  classes: ClassRow[]
  years: YearOption[]
  selectedYearId: string | null
  canManage: boolean
}) {
  const [createState, createAction] = useActionState(createStream, null)
  const [cloneState, cloneAction] = useActionState(cloneStreams, null)
  const [seedState, seedAction] = useActionState(seedDefaultStreams, null)

  const [targetClassId, setTargetClassId] = useState<string>('')
  const [fromYear, setFromYear] = useState<string>('')
  const [toYear, setToYear] = useState<string>('')

  const effectiveClassId = targetClassId || classes[0]?.id || ''

  return (
    <div className="space-y-6">
      {createState && !createState.ok && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{createState.error}</AlertDescription>
        </Alert>
      )}
      {cloneState && !cloneState.ok && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{cloneState.error}</AlertDescription>
        </Alert>
      )}
      {seedState && !seedState.ok && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{seedState.error}</AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">Classes and streams</caption>
          <thead className="border-b border-border bg-surface-2 text-left">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Label</th>
              <th scope="col" className="px-4 py-2 font-medium">Stream</th>
              <th scope="col" className="px-4 py-2 font-medium">Full name</th>
              <th scope="col" className="px-4 py-2 font-medium">Level</th>
              <th scope="col" className="px-4 py-2 font-medium">Next class</th>
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
                      <td className="px-4 py-2 text-muted-foreground">-</td>
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
                      <td className="px-4 py-2 text-muted-foreground">
                        {classes.find((c) => c.id === row.nextClassId)?.label ?? 'End of school'}
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
            <h2 className="text-sm font-semibold">Add a stream</h2>
            <form action={createAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="academicYearId" value={selectedYearId ?? ''} />

              <div className="space-y-1">
                <Label htmlFor="classId" className="text-xs">Class</Label>
                <Select name="classId" value={effectiveClassId} onValueChange={setTargetClassId}>
                  <SelectTrigger id="classId" size="sm" className="w-40">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="label" className="text-xs">Stream name</Label>
                <Input
                  id="label"
                  name="label"
                  size={16}
                  required
                  maxLength={40}
                  placeholder="East"
                  className="w-32"
                />
              </div>

              <Submit disabled={!effectiveClassId || !selectedYearId}>Add stream</Submit>
            </form>
          </section>

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

          <section className="space-y-3 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold">Clone streams into another year</h2>
            <p className="text-xs text-muted-foreground">
              Copies the stream layout only. No students move: promotion is a separate, audited,
              reversible operation.
            </p>
            <form action={cloneAction} className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="fromYear" className="text-xs">From year</Label>
                <Select name="fromYear" value={fromYear} onValueChange={setFromYear}>
                  <SelectTrigger id="fromYear" size="sm" className="w-36">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year.id} value={year.id}>
                        {year.calendarYear}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="toYear" className="text-xs">To year</Label>
                <Select name="toYear" value={toYear} onValueChange={setToYear}>
                  <SelectTrigger id="toYear" size="sm" className="w-36">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year.id} value={year.id}>
                        {year.calendarYear}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="replace" className="size-3.5" />
                Replace existing streams in the target year
              </label>

              <Submit disabled={!fromYear || !toYear || fromYear === toYear}>
                {cloneState?.ok ? `Cloned ${cloneState.copied ?? 0}` : 'Clone streams'}
              </Submit>
            </form>
          </section>
        </>
      )}
    </div>
  )
}

/** Delete is exposed separately so the UI can hide it until students exist. */
export function DeleteStreamButton({
  streamId,
  disabled,
}: {
  streamId: string
  disabled: boolean
}) {
  const [, action] = useActionState(deleteStream, null)
  if (disabled) return null

  return (
    <form action={action}>
      <input type="hidden" name="streamId" value={streamId} />
      <Submit>Delete</Submit>
    </form>
  )
}