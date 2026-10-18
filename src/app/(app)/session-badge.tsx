import { getAcademicPeriod } from '@/lib/auth/period'
import type { OperatingMode } from '@/lib/school-type'
import { Badge } from '@/components/ui/badge'
import { PeriodSelector } from './period-selector'

/**
 * The session badge is the app-wide context (section 6). It carries the
 * school type, the operating mode, and the academic year and term selectors.
 *
 * School type is informational only and deliberately not editable here.
 */
export async function SessionBadge({ mode }: { mode: OperatingMode }) {
  const { period, years, terms } = await getAcademicPeriod()

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary" className="gap-1.5">
        <span>{mode === 'senior' ? 'Senior mode' : 'Basic mode'}</span>
      </Badge>

      {period ? (
        <PeriodSelector
          years={years}
          terms={terms}
          calendarYear={period.calendarYear}
          termNumber={period.termNumber}
        />
      ) : (
        <Badge variant="outline">No academic year set up</Badge>
      )}
    </div>
  )
}