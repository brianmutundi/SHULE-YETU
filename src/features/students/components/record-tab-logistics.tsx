'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { updateStudentLogistics } from '../record-actions'
import { PendingNotice, RecordField, RecordSelect, RecordValue } from './record-field'
import type { StudentRecord } from '../record-queries'
import type { RecordActionResult } from '../record-actions'

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving...' : 'Save logistics'}
    </Button>
  )
}

const BOARDING = [
  ['day', 'Day'],
  ['boarding', 'Boarding'],
] as const

/**
 * Logistics and Finance (section 7.7).
 *
 * Boarding is only offered where the school has a boarding wing; a day school
 * is not asked a question it cannot answer meaningfully.
 */
export function LogisticsTab({
  student,
  canEdit,
  features,
}: {
  student: StudentRecord
  canEdit: boolean
  features: { boarding: boolean }
}) {
  const [editing, setEditing] = useState(false)
  const [state, action] = useActionState<RecordActionResult | null, FormData>(
    updateStudentLogistics,
    null,
  )

  const l = student.logistics

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Transport and boarding</h3>
          {canEdit && !editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>

        {!editing ? (
          <>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              <RecordValue label="Transport mode" value={l?.transportMode} />
              <RecordValue label="Route" value={l?.transportRoute} />
              {features.boarding && (
                <RecordValue
                  label="Boarding"
                  value={
                    l?.boardingStatus ? (
                      <span className="capitalize">{l.boardingStatus}</span>
                    ) : null
                  }
                />
              )}
              {features.boarding && <RecordValue label="House" value={student.house} />}
            </dl>

            {!l && !student.house && (
              <p className="text-sm text-muted-foreground">
                No logistics recorded for this learner.
              </p>
            )}
          </>
        ) : (
          <form action={action} className="space-y-4">
            <input type="hidden" name="studentId" value={student.id} />

            <div className="grid gap-3 sm:grid-cols-2">
              <RecordField name="transportMode" label="Transport mode" defaultValue={l?.transportMode} />
              <RecordField name="transportRoute" label="Route" defaultValue={l?.transportRoute} />
              {features.boarding && (
                <>
                  <RecordField label="Boarding">
                    <RecordSelect
                      name="boardingStatus"
                      defaultValue={l?.boardingStatus ?? 'day'}
                      blank="Not stated"
                      options={BOARDING}
                    />
                  </RecordField>
                  <RecordField name="house" label="House" defaultValue={student.house} />
                </>
              )}
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
        )}
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold">Fees</h3>
        <PendingNotice phase="the fees and payments phase">
          Invoices, payments, reversals, credit and balance for this learner appear here once
          fee structures are configured.
        </PendingNotice>
      </section>
    </div>
  )
}