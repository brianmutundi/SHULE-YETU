'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
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
import { renameStream } from '../actions'
import type { ClassActionResult } from '../actions'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving...' : 'Save'}
    </Button>
  )
}

/**
 * Edit Stream Label.
 *
 * Renaming only changes the stream's own label. The full name is derived by a
 * database trigger, so it follows without the client sending it.
 */
export function EditStreamLabelDialog({
  streamId,
  classLabel,
  streamLabel,
}: {
  streamId: string
  classLabel: string
  streamLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [state, action] = useActionState<ClassActionResult | null, FormData>(renameStream, null)
  const [seenState, setSeenState] = useState<ClassActionResult | null>(null)

  if (state !== seenState) {
    setSeenState(state)
    if (state?.ok) setOpen(false)
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-label={`Edit stream label for ${classLabel} ${streamLabel}`}
      >
        Edit label
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Stream Label</DialogTitle>
            <DialogDescription>
              {classLabel} {streamLabel}
            </DialogDescription>
          </DialogHeader>

          {state && !state.ok && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <form action={action} className="space-y-3">
            <input type="hidden" name="streamId" value={streamId} />
            <div className="space-y-1">
              <Label htmlFor={`label-${streamId}`} className="text-xs">
                Stream label
              </Label>
              <Input
                id={`label-${streamId}`}
                name="label"
                defaultValue={streamLabel}
                required
                maxLength={40}
              />
            </div>
            <Submit />
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
