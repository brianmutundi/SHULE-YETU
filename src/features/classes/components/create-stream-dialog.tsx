'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { createStream } from '../actions'
import type { ClassActionResult } from '../actions'

function Save({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? 'Saving...' : 'Save'}
    </Button>
  )
}

/**
 * Create Stream, opened from the Classes modal.
 *
 * The Full Name preview mirrors app.set_stream_full_name(): class label, a
 * space, stream label. It is read-only and only a preview; the database
 * trigger is what actually sets the value.
 */
export function CreateStreamDialog({
  classes,
  academicYearId,
}: {
  classes: { id: string; label: string }[]
  academicYearId: string | null
}) {
  const [open, setOpen] = useState(false)
  const [classId, setClassId] = useState('')
  const [label, setLabel] = useState('')
  const [state, action] = useActionState<ClassActionResult | null, FormData>(createStream, null)
  const [seenState, setSeenState] = useState<ClassActionResult | null>(null)

  // Adjust state while rendering: close and clear once the action succeeds.
  if (state !== seenState) {
    setSeenState(state)
    if (state?.ok) {
      setOpen(false)
      setLabel('')
    }
  }

  const effectiveClassId = classId || classes[0]?.id || ''
  const classLabel = classes.find((c) => c.id === effectiveClassId)?.label ?? ''
  const fullName = `${classLabel} ${label.trim()}`.trim()

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={!academicYearId}>
        <PlusIcon aria-hidden="true" />
        Create Stream
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Stream</DialogTitle>
            <DialogDescription>Adds a stream to a class for the selected year.</DialogDescription>
          </DialogHeader>

          <form action={action} className="space-y-4">
            <input type="hidden" name="academicYearId" value={academicYearId ?? ''} />

            {state && !state.ok && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="create-stream-class">Class</Label>
              <Select name="classId" value={effectiveClassId} onValueChange={setClassId}>
                <SelectTrigger id="create-stream-class" className="w-full">
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-stream-label">Stream Label</Label>
              <Input
                id="create-stream-label"
                name="label"
                required
                maxLength={40}
                placeholder="A"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-stream-full-name">Full Name</Label>
              <Input
                id="create-stream-full-name"
                value={fullName}
                readOnly
                aria-readonly="true"
                className="bg-surface-2"
              />
            </div>

            <div className="flex justify-end">
              <Save disabled={!effectiveClassId || label.trim().length === 0} />
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
