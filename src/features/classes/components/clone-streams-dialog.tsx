'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { CopyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { YearOption } from '@/lib/auth/period'
import { cloneStreams } from '../actions'

function Save({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? 'Cloning...' : 'Clone Streams'}
    </Button>
  )
}

/** Clone Streams: copies the stream layout between years. No learner moves. */
export function CloneStreamsDialog({ years }: { years: YearOption[] }) {
  const [open, setOpen] = useState(false)
  const [fromYear, setFromYear] = useState('')
  const [toYear, setToYear] = useState('')
  const [state, action] = useActionState(cloneStreams, null)
  const [seenState, setSeenState] = useState<typeof state>(null)

  if (state !== seenState) {
    setSeenState(state)
    if (state?.ok) setOpen(false)
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <CopyIcon aria-hidden="true" />
        Clone Streams
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Clone Streams</DialogTitle>
            <DialogDescription>
              Copies the stream layout only. No students move: promotion is a separate, audited,
              reversible operation.
            </DialogDescription>
          </DialogHeader>

          <form action={action} className="space-y-4">
            {state && !state.ok && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}

            {(
              [
                ['fromYear', 'From year', fromYear, setFromYear],
                ['toYear', 'To year', toYear, setToYear],
              ] as const
            ).map(([name, label, value, setValue]) => (
              <div key={name} className="space-y-1.5">
                <Label htmlFor={`clone-${name}`}>{label}</Label>
                <Select name={name} value={value} onValueChange={setValue}>
                  <SelectTrigger id={`clone-${name}`} className="w-full">
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
            ))}

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="replace" className="size-4" />
              Replace existing streams in the target year
            </label>

            <div className="flex justify-end">
              <Save disabled={!fromYear || !toYear || fromYear === toYear} />
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
