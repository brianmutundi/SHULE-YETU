import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth/guards'
import { getAcademicPeriod } from '@/lib/auth/period'
import { getFeeStatement, getStudentHeader } from '@/features/fees/queries'
import { StatementView } from '@/features/fees/components/statement-view'

export const instant = false

/** Fee statement for the selected term. */
export default async function StatementPage({ params }: { params: Promise<{ studentId: string }> }) {
  await requirePermission('fee.view')
  const { studentId } = await params

  const [student, { period }] = await Promise.all([getStudentHeader(studentId), getAcademicPeriod()])
  if (!student) notFound()

  const statement = period ? await getFeeStatement(studentId, period.sessionId) : null

  return (
    <StatementView
      student={student}
      termLabel={period ? `${period.termName}, ${period.calendarYear}` : 'No term selected'}
      statement={statement}
    />
  )
}
