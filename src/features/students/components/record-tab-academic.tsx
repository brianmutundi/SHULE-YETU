'use client'

import { Badge } from '@/components/ui/badge'
import { PendingNotice, RecordValue } from './record-field'
import type { StudentRecord } from '../record-queries'

/**
 * Academic (section 7.7).
 *
 * Placement details only exist in senior mode, and are read from the learner
 * rather than edited here: changing a pathway is a placement decision, not a
 * correction, and is handled by the intake flow.
 */
export function AcademicTab({
  student,
  operatingMode,
}: {
  student: StudentRecord
  operatingMode: 'basic' | 'senior'
}) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-sm font-semibold">Placement</h3>
        {operatingMode === 'senior' ? (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
            <RecordValue
              label="Pathway"
              value={student.pathwayCode ? `${student.pathwayName} (${student.pathwayCode})` : null}
            />
            <RecordValue label="Track" value={student.track} />
            <RecordValue
              label="KNEC assessment no."
              value={<span className="font-mono">{student.assessmentNumber}</span>}
            />
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            This school runs basic mode, so there is no senior placement to record.
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold">Background</h3>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
          <RecordValue label="Previous school" value={student.previousSchool} />
          <RecordValue label="Transfer reason" value={student.transferReason} />
          <RecordValue label="Admitted on" value={student.admittedOn} />
          <RecordValue label="Class admitted" value={student.classLabel} />
        </dl>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold">Subject combination</h3>
        {student.subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {operatingMode === 'senior'
              ? 'No subjects recorded. A pathway must be set before subjects can be allocated.'
              : 'Basic mode does not record a subject combination.'}
          </p>
        ) : (
          <ul role="list" className="flex flex-wrap gap-2">
            {student.subjects.map((s) => (
              <li key={s.id}>
                <span className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
                  {s.name}
                  {s.requirement === 'compulsory' && <Badge variant="secondary">Compulsory</Badge>}
                  {s.requirement === 'elective' && <Badge variant="outline">Elective</Badge>}
                  {s.requirement === null && <Badge variant="outline">Chosen</Badge>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {student.subjects.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Compulsory subjects come from the pathway; chosen subjects were selected by the
            learner or their guardian.
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold">Results</h3>
        <PendingNotice phase="the assessments phase">
          Subject results, continuous assessment scores and checkpoints are recorded here once
          assessments are enabled.
        </PendingNotice>
      </section>
    </div>
  )
}