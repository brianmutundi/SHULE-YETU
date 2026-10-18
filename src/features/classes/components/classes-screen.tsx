import { getSessionContext } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import { getClassesWithStreams, getSelectedYear } from '../queries'
import { ClassesManager } from './classes-manager'

/** Data and manager for Classes and streams. Shared by the page and the modal. */
export async function ClassesScreen() {
  const session = await getSessionContext()
  const { period, years } = await getSelectedYear()
  const classes = period ? await getClassesWithStreams(period.academicYearId) : []

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {period
          ? `Streams for ${period.calendarYear}. Classes are fixed by the school type and cannot be added or removed here.`
          : 'No academic year is set up yet.'}
      </p>
      <ClassesManager
        classes={classes}
        years={years}
        selectedYearId={period?.academicYearId ?? null}
        calendarYear={period?.calendarYear ?? null}
        canManage={can(session.role, 'session.manage')}
      />
    </>
  )
}
