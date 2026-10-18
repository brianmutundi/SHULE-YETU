import { Avatar } from '@/components/shared/avatar'
import { Chip } from '@/components/shared/chip'
import { Progress } from '@/components/ui/progress'
import { formatDate } from '@/lib/dates'
import type { MasterStudent } from '@/features/guardians/queries'
import { capitalise, relationshipLabel, statusTone } from '../master-filters'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

/** Right-hand panel for the selected learner. */
export function StudentProfile({ profile }: { profile: MasterStudent }) {
  const { attendance } = profile

  return (
    <div className="space-y-5 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <Avatar name={profile.fullName} src={profile.photoUrl} size="lg" />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{profile.fullName}</h2>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Chip tone={statusTone(profile.status)}>{capitalise(profile.status)}</Chip>
            {profile.classLabel && <Chip tone="class">{profile.classLabel}</Chip>}
            <Chip tone="gender">{capitalise(profile.gender)}</Chip>
          </div>
        </div>
      </div>

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Field label="Student ID">
          <span className="font-mono">{profile.studentNo}</span>
        </Field>
        <Field label="Full Name">{profile.fullName}</Field>
        <Field label="Date of Birth">{formatDate(profile.dateOfBirth)}</Field>
        <Field label="Class Admitted">{profile.classAdmitted ?? 'Not recorded'}</Field>
        <Field label="Address">{profile.address ?? 'Not recorded'}</Field>
        <Field label="Tuition Waiver">
          <Chip tone={profile.tuitionWaiver ? 'warning' : 'neutral'}>
            {profile.tuitionWaiver ? 'Yes' : 'No'}
          </Chip>
        </Field>
      </dl>

      <section aria-labelledby="guardians-heading">
        <h3 id="guardians-heading" className="mb-2 text-sm font-medium">
          Guardians
        </h3>
        {profile.guardians.length === 0 ? (
          <p className="text-sm text-muted-foreground">No guardian linked yet.</p>
        ) : (
          <ul role="list" className="grid gap-2 sm:grid-cols-2">
            {profile.guardians.map((g) => (
              <li key={g.linkId} className="space-y-1 rounded-lg border border-border bg-surface-2 p-3">
                <p className="truncate text-sm font-medium">{g.fullName}</p>
                <Chip tone="relation">{relationshipLabel(g.relationship)}</Chip>
                <p className="pt-1">
                  <a href={`tel:${g.phone}`} className="font-mono text-xs text-muted-foreground hover:underline">
                    {g.phone}
                  </a>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {attendance && (
        <section aria-labelledby="attendance-heading" className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 id="attendance-heading" className="text-sm font-medium">
              Attendance this term
            </h3>
            <span className="text-sm font-medium">
              {attendance.ratePct === null ? 'No records' : `${attendance.ratePct}%`}
            </span>
          </div>
          <Progress
            value={attendance.ratePct ?? 0}
            aria-label="Attendance rate"
            className="h-2"
          />
          <p className="text-xs text-muted-foreground">
            {attendance.lastAbsent
              ? `Last absent: ${formatDate(attendance.lastAbsent)}`
              : attendance.markedDays === 0
                ? 'No attendance recorded this term.'
                : 'No absences this term.'}
          </p>
        </section>
      )}
    </div>
  )
}
