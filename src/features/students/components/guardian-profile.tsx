'use client'

import { useActionState } from 'react'
import { Chip } from '@/components/shared/chip'
import { Button } from '@/components/ui/button'
import { unlinkStudent } from '@/features/guardians/actions'
import type { GuardianWithStudents } from '@/features/guardians/queries'
import { capitalise, relationshipLabel, statusTone } from '../master-filters'

/** Unlink is a server action, so it gets its own form rather than a handler. */
function UnlinkButton({ guardianId, studentId }: { guardianId: string; studentId: string }) {
  const [, action] = useActionState(unlinkStudent, null)

  return (
    <form action={action} className="ml-auto">
      <input type="hidden" name="guardianId" value={guardianId} />
      <input type="hidden" name="studentId" value={studentId} />
      <Button size="sm" variant="ghost" type="submit">
        Unlink
      </Button>
    </form>
  )
}

/** Right-hand panel for the selected guardian and their linked learners. */
export function GuardianProfile({
  guardian,
  canLink,
}: {
  guardian: GuardianWithStudents | undefined
  canLink: boolean
}) {
  if (!guardian) {
    return <p className="text-sm text-muted-foreground">Select a guardian to see their details.</p>
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <div>
        <h2 className="text-lg font-semibold">{guardian.fullName}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {guardian.relationship && (
            <Chip tone="relation">{relationshipLabel(guardian.relationship)}</Chip>
          )}
          {guardian.isDeceased && <Chip tone="warning">Deceased</Chip>}
        </div>
      </div>

      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Phone</dt>
          <dd className="font-mono text-sm">{guardian.phone}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Email</dt>
          <dd className="text-sm">{guardian.email ?? 'Not recorded'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Occupation</dt>
          <dd className="text-sm">{guardian.occupation ?? 'Not recorded'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Address</dt>
          <dd className="text-sm">{guardian.address ?? 'Not recorded'}</dd>
        </div>
        {guardian.isDeceased && guardian.absenceReason && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Absence reason</dt>
            <dd className="text-sm">{guardian.absenceReason}</dd>
          </div>
        )}
      </dl>

      <div>
        <h3 className="mb-2 text-sm font-medium">Linked learners</h3>
        {guardian.links.length === 0 ? (
          <p className="text-sm text-muted-foreground">No learners linked to this guardian yet.</p>
        ) : (
          <ul role="list" className="space-y-2">
            {guardian.links.map((s) => (
              <li
                key={s.linkId}
                className="flex flex-wrap items-center gap-2 rounded-md bg-surface-2 p-2 text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground">{s.studentNo}</span>
                <span className="font-medium">{s.fullName}</span>
                <Chip tone={statusTone(s.status)}>{capitalise(s.status)}</Chip>
                <span className="text-xs text-muted-foreground">{s.streamLabel ?? 'Unassigned'}</span>
                {canLink && <UnlinkButton guardianId={guardian.id} studentId={s.studentId} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
