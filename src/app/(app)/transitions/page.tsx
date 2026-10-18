import { getSessionContext } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import {
  getPromotionRuns,
  getStreamsForYear,
  getTerms,
  getYears,
} from '@/features/transitions/queries'
import { TransitionsView } from '@/features/transitions/components/transitions-view'

// Auth-dependent, so it cannot be prerendered.
export const instant = false

export default async function TransitionsPage() {
  const session = await getSessionContext()

  const [terms, years, runs] = await Promise.all([
    getTerms(),
    getYears(),
    getPromotionRuns(),
  ])

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Transitions</h1>
        <p className="text-muted-foreground">
          Terms, academic years and end-of-year promotion.
        </p>
      </div>

      <TransitionsView
        terms={terms}
        years={years}
        runs={runs}
        targetStreams={targetStreams}
        canManageSessions={can(session.role, 'session.manage')}
        canPromote={can(session.role, 'promotion.run')}
      />
    </div>
  )
}