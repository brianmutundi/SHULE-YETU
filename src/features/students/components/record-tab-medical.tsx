'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { updateStudentMedical } from '../record-actions'
import { RecordField } from './record-field'
import type { StudentRecord } from '../record-queries'
import type { RecordActionResult } from '../record-actions'

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving...' : 'Save medical record'}
    </Button>
  )
}

const FIELDS = [
  ['bloodGroup', 'Blood group'],
  ['emergencyContact', 'Emergency contact'],
  ['allergies', 'Allergies'],
  ['conditions', 'Existing conditions'],
  ['strengths', 'Strengths'],
  ['challenges', 'Challenges'],
  ['specialNeedsCategory', 'Special needs category'],
  ['specialNeedsNotes', 'Special needs notes'],
] as const

/**
 * Medical (section 7.7).
 *
 * Read-only to anyone without student.edit, because medical detail is among the
 * most sensitive data the school holds and the Data Protection Act applies to
 * it like any other personal data.
 */
export function MedicalTab({ student, canEdit }: { student: StudentRecord; canEdit: boolean }) {
  const [editing, setEditing] = useState(false)
  const [state, action] = useActionState<RecordActionResult | null, FormData>(
    updateStudentMedical,
    null,
  )

  const m = student.medical

  if (!editing) {
    return (
      <div className="space-y-4">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {FIELDS.map(([key, label]) => (
            <div key={key}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm">
                {(m as Record<string, string | null> | null)?.[key] ?? (
                  <span className="text-muted-foreground">Not recorded</span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        {!m && (
          <p className="text-sm text-muted-foreground">
            No medical record has been captured for this learner.
          </p>
        )}

        {canEdit && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            {m ? 'Edit medical record' : 'Add medical record'}
          </Button>
        )}
      </div>
    )
  }

  const values = (m ?? {}) as Record<string, string | null>

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="studentId" value={student.id} />

      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(([key, label]) => (
          <RecordField key={key} name={key} label={label} defaultValue={values[key]} />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <SaveButton />
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <span aria-live="polite" className="text-sm">
          {state?.ok && <span className="text-muted-foreground">Saved.</span>}
          {state && !state.ok && <span className="text-destructive">{state.error}</span>}
        </span>
      </div>
    </form>
  )
}