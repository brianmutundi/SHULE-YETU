'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useActionState } from 'react'
import { unlinkStudent } from '@/features/guardians/actions'
import { AddGuardianDialog } from '@/features/guardians/components/add-guardian-dialog'
import { RecordValue } from './record-field'
import type { StudentRecord } from '../record-queries'

function UnlinkButton({ guardianId, studentId, name }: { guardianId: string; studentId: string; name: string }) {
  const [, action] = useActionState(unlinkStudent, null)

  return (
    <form action={action} className="ml-auto">
      <input type="hidden" name="guardianId" value={guardianId} />
      <input type="hidden" name="studentId" value={studentId} />
      <Button size="sm" variant="ghost" type="submit">
        Unlink
      </Button>
      <span className="sr-only">Unlink {name} from this learner</span>
    </form>
  )
}

/**
 * Family and Contact (section 7.7).
 *
 * The fee payer and emergency contact are shown explicitly because those are
 * the two a clerk needs when a payment or an injury happens.
 */
export function FamilyTab({ student, canLink }: { student: StudentRecord; canLink: boolean }) {
  const hasFeePayer = student.guardians.some((g) => g.isFeePayer)

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-sm font-semibold">Learner contact</h3>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
          <RecordValue label="Phone" value={student.phone} />
          <RecordValue label="Email" value={student.email} />
          <RecordValue label="Home address" value={student.address} />
        </dl>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Guardians</h3>
          {canLink && (
            <AddGuardianDialog
              studentId={student.id}
              studentName={student.fullName}
              hasFeePayer={hasFeePayer}
            />
          )}
        </div>

        {student.guardians.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No guardian linked. Add one here, or link an existing guardian from the
            Guardians pane on the learners screen.
          </p>
        ) : (
          <ul role="list" className="space-y-3">
            {student.guardians.map((g) => (
              <li key={g.linkId} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{g.fullName}</span>
                  <Badge variant="secondary" className="capitalize">
                    {g.relationship.replace(/_/g, ' ')}
                  </Badge>
                  {g.isPrimary && <Badge variant="outline">Primary</Badge>}
                  {g.isFeePayer && <Badge variant="outline">Fee payer</Badge>}
                  {g.isEmergencyContact && <Badge variant="outline">Emergency contact</Badge>}
                  {g.isDeceased && <Badge variant="destructive">Deceased or absent</Badge>}
                  {canLink && (
                    <UnlinkButton guardianId={g.guardianId} studentId={student.id} name={g.fullName} />
                  )}
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-3">
                  <RecordValue label="Phone" value={<span className="font-mono">{g.phone}</span>} />
                  <RecordValue label="Email" value={g.email} />
                  <RecordValue label="National ID" value={g.nationalId} />
                  <RecordValue label="Occupation" value={g.occupation} />
                  <RecordValue label="Address" value={g.address} />
                  {g.isDeceased && <RecordValue label="Absence reason" value={g.absenceReason} />}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}