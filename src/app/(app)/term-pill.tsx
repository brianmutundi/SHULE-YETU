import { getAcademicPeriod } from '@/lib/auth/period'
import { Chip } from '@/components/shared/chip'
import { TermPillMenu } from './term-pill-menu'

/** Server wrapper: resolves the period from cookies, hands it to the pill. */
export async function TermPill() {
  const { period, years, terms } = await getAcademicPeriod()

  if (!period) {
    return <Chip tone="neutral">No term set up</Chip>
  }

  return (
    <TermPillMenu
      years={years}
      terms={terms}
      calendarYear={period.calendarYear}
      termNumber={period.termNumber}
    />
  )
}
