import { getSessionContext } from '@/lib/auth/session'
import { getAcademicPeriod } from '@/lib/auth/period'
import { can } from '@/lib/auth/permissions'
import { getFilterOptions, getStudentDirectory } from '@/features/students/queries'
import { directorySearchSchema } from '@/features/students/schema'
import { DirectoryView } from '@/features/students/components/directory-view'
import { QuickCreateStudent } from '@/features/students/components/quick-create-student'

export const instant = false

export default async function StudentDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getSessionContext()
  const { period } = await getAcademicPeriod()
  const raw = await searchParams

  const parsed = directorySearchSchema.safeParse({
    search: typeof raw.search === 'string' ? raw.search : undefined,
    status: typeof raw.status === 'string' ? raw.status : undefined,
    gender: typeof raw.gender === 'string' ? raw.gender : undefined,
    streamId: typeof raw.streamId === 'string' ? raw.streamId : undefined,
    page: typeof raw.page === 'string' ? raw.page : undefined,
  })

  const filters = parsed.success
    ? parsed.data
    : { search: '', status: 'all' as const, gender: 'all' as const, streamId: '', page: 1 }

  const [result, options] = await Promise.all([
    getStudentDirectory({
      search: filters.search,
      status: filters.status,
      gender: filters.gender,
      streamId: filters.streamId,
      page: filters.page,
      pageSize: 25,
    }),
    period ? getFilterOptions(period.academicYearId) : Promise.resolve({ classes: [], streams: [] }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Learner directory</h1>
          <p className="text-muted-foreground">
            {period ? `Streams for ${period.calendarYear}.` : 'No academic year set up.'}
          </p>
        </div>
        {can(session.role, 'student.enrol') && <QuickCreateStudent options={options} />}
      </div>

      <DirectoryView
        result={result}
        filters={{
          search: filters.search ?? '',
          status: filters.status,
          gender: filters.gender,
          streamId: filters.streamId ?? '',
          page: filters.page,
        }}
        options={options}
      />
    </div>
  )
}