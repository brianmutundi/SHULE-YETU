'use client'

import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
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
}: {
  studentId: string
  studentName: string
  hasFeePayer: boolean
}) {
  const [open, setOpen] = useState(false)
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

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Add guardian
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Add a guardian to ${studentName}`}
            className="w-full max-w-2xl space-y-4 rounded-lg border border-border bg-background p-4"
          >
            <div>
              <h3 className="text-base font-semibold">Add guardian to {studentName}</h3>
              <p className="text-sm text-muted-foreground">
                Creates the guardian and links them to this learner in one step.
              </p>
            </div>

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
          </div>
        </div>
      )}
    </>
  )
}