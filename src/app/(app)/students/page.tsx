import { getSessionContext } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import {
  getGuardiansWithStudents,
  getMasterStudents,
  getStudentProfile,
} from '@/features/guardians/queries'
import { MasterDetail } from '@/features/students/components/master-detail'
import type { Pane } from '@/features/students/components/master-detail'

export const instant = false

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getSessionContext()
  const raw = await searchParams

  const pane: Pane = raw.pane === 'guardians' ? 'guardians' : 'students'
  const selectedId = typeof raw.id === 'string' && raw.id ? raw.id : null
  const search = typeof raw.search === 'string' ? raw.search : ''

  const [students, guardians, profile] = await Promise.all([
    getMasterStudents(search),
    // Only search guardians when the guardians pane is open; otherwise the
    // query would run against a filter the user cannot see.
    getGuardiansWithStudents(pane === 'guardians' ? search : ''),
    pane === 'students' && selectedId ? getStudentProfile(selectedId) : Promise.resolve(null),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
        <p className="text-muted-foreground">
          {pane === 'students'
            ? 'Select a learner to see their record and guardians.'
            : 'Select a guardian to see their details and linked learners.'}
        </p>
      </div>

      <MasterDetail
        pane={pane}
        students={students}
        guardians={guardians}
        profile={profile}
        selectedId={selectedId}
        search={search}
        canLink={can(session.role, 'guardian.manage')}
      />
    </div>
  )
}