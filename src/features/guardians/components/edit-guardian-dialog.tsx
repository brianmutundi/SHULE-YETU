'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RecordField } from '@/features/students/components/record-field'
import { updateGuardian } from '../actions'
import type { GuardianActionResult } from '../actions'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving...' : 'Save changes'}
    </Button>
  )
}

/** Edit a guardian's name, phone and address. Always controlled by the row menu. */
export function EditGuardianDialog({
  guardian,
  open,
  onOpenChange,
}: {
  guardian: { id: string; fullName: string; phone: string; address: string | null }
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, action] = useActionState<GuardianActionResult | null, FormData>(
    updateGuardian,
    null,
  )
  const [seenState, setSeenState] = useState<GuardianActionResult | null>(null)

  if (state !== seenState) {
    setSeenState(state)
    if (state?.ok) onOpenChange(false)
  }

  const fieldError = (name: string) =>
    state && !state.ok ? state.fieldErrors?.[name]?.[0] : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit guardian</DialogTitle>
          <DialogDescription>{guardian.fullName}</DialogDescription>
        </DialogHeader>

        {state && !state.ok && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <form action={action} className="space-y-3">
          <input type="hidden" name="guardianId" value={guardian.id} />
          <RecordField
            name="fullName"
            label="Full name"
            required
            defaultValue={guardian.fullName}
            error={fieldError('fullName')}
          />
          <RecordField
            name="phone"
            label="Phone"
            required
            defaultValue={guardian.phone}
            placeholder="07XX XXX XXX"
            error={fieldError('phone')}
          />
          <RecordField
            name="address"
            label="Address"
            defaultValue={guardian.address}
            error={fieldError('address')}
          />
          <Submit />
        </form>
      </DialogContent>
    </Dialog>
  )
}
