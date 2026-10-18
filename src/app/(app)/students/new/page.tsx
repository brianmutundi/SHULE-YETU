import { getSessionContext } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import { getAcademicPeriod } from '@/lib/auth/period'
import { getWizardReferenceData } from '@/features/enrollment/queries'
import { EnrolmentWizard } from '@/features/enrollment/components/enrolment-wizard'

export const instant = false

export default async function NewStudentPage() {
  const session = await getSessionContext()
  const { period, years } = await getAcademicPeriod()
  const { streams, pathways } = await getWizardReferenceData()

  const canEnrol = can(session.role, 'student.enrol')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Enrol a learner</h1>
        <p className="text-muted-foreground">
          {session.operatingMode === 'senior'
            ? 'Senior placement: the learner arrives from another school after Grade 9.'
            : 'Admissions for this school.'}{' '}
          Everything is written in one transaction when you complete enrolment.
        </p>
      </div>

      {!canEnrol ? (
        <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">
          Your role ({session.role}) cannot enrol learners. Ask an owner or admin.
        </p>
      ) : (
        <EnrolmentWizard
          operatingMode={session.operatingMode}
          years={years}
          streams={streams}
          pathways={pathways}
          defaultYearId={period?.academicYearId ?? ''}
        />
      )}
    </div>
  )
}