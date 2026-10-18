import { getSessionContext } from '@/lib/auth/session'
import { getAcademicPeriod } from '@/lib/auth/period'
import { can } from '@/lib/auth/permissions'
import { getRubric, getAreas, getSubjects, getStreams, getTasks } from '@/features/assessments/queries'
import { AssessmentsClient } from './assessments-client'

// Auth-dependent, so it cannot be prerendered.
export const instant = false

export default async function AssessmentsPage() {
  const session = await getSessionContext()
  const { period } = await getAcademicPeriod()

  const [rubric, areas, subjects, streams, tasks] = await Promise.all([
    getRubric(),
    getAreas(),
    getSubjects(),
    getStreams(),
    getTasks(),
  ]) as [import('@/features/assessments/schema').PerformanceLevel[], import('@/features/assessments/queries').AreaOption[], import('@/features/assessments/queries').SubjectOption[], import('@/features/assessments/queries').StreamOption[], import('@/features/assessments/queries').TaskOption[]]

  return (
    <AssessmentsClient
      session={session}
      period={period}
      rubric={rubric}
      areas={areas}
      subjects={subjects}
      streams={streams}
      tasks={tasks}
      canManage={can(session.role, 'marks.record')}
      canIssue={can(session.role, 'report_card.issue')}
    />
  )
}