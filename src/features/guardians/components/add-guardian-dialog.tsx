'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { addStudentGuardian } from '../actions'
import { RecordField, RecordSelect } from '@/features/students/components/record-field'
import type { GuardianActionResult } from '../actions'

const RELATIONSHIPS = [
  ['parent', 'Parent'],
  ['grandparent', 'Grandparent'],
  ['sibling', 'Sibling'],
  ['aunt_uncle', 'Aunt or uncle'],
  ['relative', 'Relative'],
  ['guardian', 'Guardian'],
  ['other', 'Other'],
] as const

function Submit({ studentName }: { studentName: string }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Adding...' : `Add guardian to ${studentName}`}
    </Button>
  )
}

/**
 * Add a guardian to this learner from the Family tab.
 *
 * Reusing the existing guardian is possible from the Guardians pane on the
 * learners screen; this is for the case where the guardian has never been
 * recorded at all, which is common for orphans and fostered learners.
 */
export function AddGuardianDialog({
  studentId,
  studentName,
  hasFeePayer,
  open: controlledOpen,
  onOpenChange,
}: {
  studentId: string
  studentName: string
  hasFeePayer: boolean
  /** Pass to control the dialog from a menu; it then renders no trigger. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [innerOpen, setInnerOpen] = useState(false)
  const controlled = controlledOpen !== undefined
  const open = controlled ? controlledOpen : innerOpen
  const setOpen = (next: boolean) => {
    if (!controlled) setInnerOpen(next)
    onOpenChange?.(next)
  }
  const [state, action] = useActionState<GuardianActionResult | null, FormData>(
    addStudentGuardian,
    null,
  )
  const [seenState, setSeenState] = useState<GuardianActionResult | null>(null)

  // Close on a successful add so the registrar sees the new guardian in the
  // list. Adjusting state during render rather than in an effect avoids the
  // cascading render the lint rule warns about.
  if (state !== seenState) {
    setSeenState(state)
    if (state?.ok) setOpen(false)
  }

  return (
    <>
      {!controlled && (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Add guardian
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add guardian to {studentName}</DialogTitle>
            <DialogDescription>
              Creates the guardian and links them to this learner in one step.
            </DialogDescription>
          </DialogHeader>

            <form action={action} className="space-y-4">
              <input type="hidden" name="studentId" value={studentId} />

              <div className="grid gap-3 sm:grid-cols-2">
                <RecordField name="fullName" label="Full name" required />
                <RecordField name="phone" label="Phone" required placeholder="07XX XXX XXX" />
                <RecordField name="nationalId" label="National ID" />
                <RecordField name="email" label="Email" />
                <RecordField name="occupation" label="Occupation" />
                <RecordField name="address" label="Address" />
                <RecordField label="Relationship" required>
                  <RecordSelect name="relationship" defaultValue="parent" options={RELATIONSHIPS} />
                </RecordField>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-xs font-medium">Role for this learner</legend>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name="isPrimary" value="true" className="size-3.5" />
                    Primary guardian
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      name="isFeePayer"
                      value="true"
                      className="size-3.5"
                    />
                    Fee payer
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      name="isEmergencyContact"
                      value="true"
                      className="size-3.5"
                    />
                    Emergency contact
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name="isDeceased" value="true" className="size-3.5" />
                    Deceased or absent
                  </label>
                </div>
                {hasFeePayer && (
                  <p className="text-xs text-muted-foreground">
                    This learner already has a fee payer, so the new guardian will be saved
                    without becoming one.
                  </p>
                )}
              </fieldset>

              <div aria-live="polite">
                {state && !state.ok && <p className="text-sm text-destructive">{state.error}</p>}
              </div>

              <div className="flex items-center gap-3">
                <Submit studentName={studentName} />
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
