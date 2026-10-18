import { getSessionContext } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import { getClassesWithStreams, getSelectedYear } from '@/features/classes/queries'
import { ClassesManager } from '@/features/classes/components/classes-manager'

export const instant = false

export default async function ClassesPage() {
  const session = await getSessionContext()
  const { period, years } = await getSelectedYear()

  const classes = period ? await getClassesWithStreams(period.academicYearId) : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Classes and streams</h1>
        <p className="text-muted-foreground">
          {period
            ? `Streams for ${period.calendarYear}. Classes are fixed by the school type and cannot be added or removed here.`
            : 'No academic year is set up yet.'}
        </p>
      </div>

      <ClassesManager
        classes={classes}
        years={years}
        selectedYearId={period?.academicYearId ?? null}
        canManage={can(session.role, 'session.manage')}
      />
    </div>
  )
}