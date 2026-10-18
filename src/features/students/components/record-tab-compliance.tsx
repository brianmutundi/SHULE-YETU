'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RecordSelect } from './record-field'
import { updateStudentConsent } from '../record-actions'
import type { StudentRecord } from '../record-queries'
import type { RecordActionResult } from '../record-actions'

/**
 * Consents (section 4B, Data Protection Act 2019).
 *
 * Consent is not a yes/no field. Each one carries the lawful basis it was
 * recorded under, and withdrawing is stored as granted = false rather than
 * deleting the row, so the fact that consent was once given and later
 * withdrawn stays auditable.
 */

const CONSENTS = [
  {
    kind: 'guardian_enrollment' as const,
    label: 'Enrolment consent',
    help: 'The parent or guardian agreed to enrol this learner. Required.',
    locked: true,
  },
  {
    kind: 'data_privacy' as const,
    label: 'Data privacy',
    help: 'How this learner\u2019s personal data may be processed and retained.',
    locked: false,
  },
  {
    kind: 'media' as const,
    label: 'Media and photography',
    help: 'Whether this learner may appear in school photographs and publications.',
    locked: false,
  },
]

const BASES = [
  ['consent', 'Consent'],
  ['contract', 'Contract'],
  ['legal_obligation', 'Legal obligation'],
  ['vital_interests', 'Vital interests'],
  ['public_task', 'Public task'],
] as const

function ConsentRow({
  studentId,
  entry,
  definition,
  canEdit,
}: {
  studentId: string
  entry: StudentRecord['consents'][number] | undefined
  definition: (typeof CONSENTS)[number]
  canEdit: boolean
}) {
  const [state, action] = useActionState<RecordActionResult | null, FormData>(
    updateStudentConsent,
    null,
  )
  const { pending } = useFormStatus()

  const granted = state?.ok ? undefined : entry?.granted

  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{definition.label}</span>
        <Badge variant={granted ? 'default' : 'secondary'}>
          {granted ? 'Granted' : 'Not granted'}
        </Badge>
        {entry && (
          <span className="text-xs text-muted-foreground">
            recorded {new Date(entry.grantedAt).toLocaleDateString('en-GB')} under{' '}
            {entry.lawfulBasis.replace(/_/g, ' ')}
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-muted-foreground">{definition.help}</p>

      {canEdit && (
        <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="studentId" value={studentId} />
          <input type="hidden" name="consentKind" value={definition.kind} />

          <div className="space-y-1">
            <label htmlFor={`${definition.kind}-granted`} className="text-xs">
              Decision
            </label>
            <select
              id={`${definition.kind}-granted`}
              name="granted"
              defaultValue={entry?.granted ? 'true' : 'false'}
              className="h-9 rounded-md border border-border bg-transparent px-3 text-sm"
            >
              <option value="true">Granted</option>
              <option value="false">Withdrawn</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor={`${definition.kind}-basis`} className="text-xs">
              Lawful basis
            </label>
            <RecordSelect
              name="lawfulBasis"
              id={`${definition.kind}-basis`}
              defaultValue={entry?.lawfulBasis ?? 'consent'}
              options={BASES}
            />
          </div>

          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            {pending ? 'Saving...' : 'Record'}
          </Button>

          <span aria-live="polite" className="text-xs">
            {state?.ok && <span className="text-muted-foreground">Recorded.</span>}
            {state && !state.ok && <span className="text-destructive">{state.error}</span>}
          </span>
        </form>
      )}
    </li>
  )
}

/** Docs and Compliance (section 7.7). */
export function ComplianceTab({ student, canEdit }: { student: StudentRecord; canEdit: boolean }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-sm font-semibold">Data protection consents</h3>
        <ul role="list" className="space-y-3">
          {CONSENTS.map((definition) => (
            <ConsentRow
              key={definition.kind}
              studentId={student.id}
              entry={student.consents.find((c) => c.consentKind === definition.kind)}
              definition={definition}
              canEdit={canEdit}
            />
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold">Documents</h3>
        {student.documents.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4">
            <p className="text-sm font-medium">No documents uploaded</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Birth certificates, transfer forms and medical reports are attached here. Upload
              needs file storage, which is not configured on this project yet.
            </p>
          </div>
        ) : (
          <ul role="list" className="space-y-2">
            {student.documents.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-sm">
                <span className="font-medium capitalize">{d.kind.replace(/_/g, ' ')}</span>
                <span className="text-xs text-muted-foreground">
                  added {new Date(d.createdAt).toLocaleDateString('en-GB')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}