import { notFound } from 'next/navigation'
import { getSessionContext } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import { hasBoardingRollCall } from '@/lib/school-type'
import { getStudentRecord } from '@/features/students/record-queries'
import { StudentRecordView } from '@/features/students/components/student-record'
import { BackToDirectory } from '@/features/students/components/record-tab-bio'

export const instant = false

export default async function StudentRecordPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await getSessionContext()
  const student = await getStudentRecord(id)

  // A learner outside the tenant is not found rather than forbidden, so the
  // page cannot be used to probe which ids exist in another school.
  if (!student) notFound()

  return (
    <div className="space-y-4">
      <BackToDirectory />
      <StudentRecordView
        student={student}
        operatingMode={session.operatingMode}
        canEdit={can(session.role, 'student.edit')}
        canManageGuardians={can(session.role, 'guardian.manage')}
        features={{ boarding: hasBoardingRollCall(session.operatingMode) }}
      />
    </div>
  )
}