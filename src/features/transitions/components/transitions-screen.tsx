import { getSessionContext } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import { getPromotionRuns, getStreamsForYear, getTerms, getYears } from '../queries'
import { TransitionsView } from './transitions-view'

/** Data and tabs for Transitions. Shared by the page and the modal. */
export async function TransitionsScreen() {
  const session = await getSessionContext()

  const [terms, years, runs] = await Promise.all([getTerms(), getYears(), getPromotionRuns()])

  // Stream counts for the years a promotion could target, so the screen can say
  // which destination years are ready. Only years other than the current one are
  // promotion targets.
  const targets = years.filter((y) => !y.isCurrent).slice(0, 6)

  const targetStreams = await Promise.all(
    targets.map(async (y) => ({
      yearLabel: String(y.calendarYear),
      total: (await getStreamsForYear(y.id)).total,
    })),
  )

  return (
    <TransitionsView
      terms={terms}
      years={years}
      runs={runs}
      targetStreams={targetStreams}
      canManageSessions={can(session.role, 'session.manage')}
      canPromote={can(session.role, 'promotion.run')}
    />
  )
}
