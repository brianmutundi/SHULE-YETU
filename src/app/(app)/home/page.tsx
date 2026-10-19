import { getSessionContext } from '@/lib/auth/session'
import { getAcademicPeriod } from '@/lib/auth/period'
import { can } from '@/lib/auth/permissions'
import { todayInNairobi } from '@/lib/dates'
import { Avatar } from '@/components/shared/avatar'
import {
  getDebtors,
  getKpis,
  getPaymentsSeries,
  getPopulation,
  getStaffBreakdown,
  getTransactions,
} from '@/features/dashboard/queries'
import { RANGE_LABELS, parseRange, rangeDates } from '@/features/dashboard/ranges'
import type { StaffDimension } from '@/features/dashboard/format'
import type { BreakdownRow } from '@/features/dashboard/types'
import { KpiCards } from '@/features/dashboard/components/kpi-cards'
import { PopulationChart } from '@/features/dashboard/components/population-chart'
import { StaffDonut } from '@/features/dashboard/components/staff-donut'
import { DebtorsChart } from '@/features/dashboard/components/debtors-chart'
import { PaymentsChart } from '@/features/dashboard/components/payments-chart'
import { TermCalendar } from '@/features/dashboard/components/term-calendar'
import { TransactionsDrawer } from '@/features/dashboard/components/transactions-drawer'

// Resolves the session from cookies, so this route cannot be prerendered.
export const instant = false

/**
 * Home dashboard. Every figure comes from a database function through
 * features/dashboard/queries; this page only lays them out. Money widgets are
 * fetched only for roles that may see fees, and the functions refuse anyone
 * else.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getSessionContext()
  const raw = await searchParams

  const range = parseRange(typeof raw.range === 'string' ? raw.range : undefined)
  const loadAll = raw.all === '1'
  const today = todayInNairobi()
  const finance = can(session.role, 'fee.view')

  const { period } = await getAcademicPeriod()
  const sessionId = period?.sessionId ?? null
  const term = period
    ? { openedOn: period.openedOn, midtermBreakOn: period.midtermBreakOn, closingOn: period.closingOn }
    : null
  const dates = rangeDates(range, today, term)

  // The drawer shows today until "Get All" widens it to the chart's range.
  const drawer = loadAll
    ? { from: dates.from, to: dates.to, limit: 500, title: RANGE_LABELS[range] }
    : { from: today, to: today, limit: 50, title: 'Today' }

  const [kpis, population, gender, staffType, employer, debtors, series, transactions] =
    await Promise.all([
      getKpis(sessionId),
      getPopulation(),
      getStaffBreakdown('gender'),
      getStaffBreakdown('staff_type'),
      getStaffBreakdown('employer'),
      finance ? getDebtors(sessionId) : Promise.resolve([]),
      finance ? getPaymentsSeries(dates.from, dates.to, dates.bucket) : Promise.resolve([]),
      finance
        ? getTransactions(drawer.from, drawer.to, drawer.limit)
        : Promise.resolve({ count: 0, total: 0, items: [] }),
    ])

  const staff: Record<StaffDimension, BreakdownRow[]> = {
    gender,
    staff_type: staffType,
    employer,
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        {kpis.logoUrl && /^https?:\/\//i.test(kpis.logoUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo host is not in next.config images
          <img src={kpis.logoUrl} alt="" className="size-14 rounded-xl object-contain" />
        ) : (
          <Avatar name={kpis.schoolName} size="lg" className="rounded-xl" />
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{kpis.schoolName}</h1>
          <p className="text-muted-foreground">
            {session.fullName ? `Welcome, ${session.fullName}` : 'Welcome'}
          </p>
        </div>
      </header>

      <KpiCards
        students={kpis.students}
        staff={kpis.staff}
        expected={kpis.expected}
        accrued={kpis.accrued}
        finance={kpis.finance}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PopulationChart data={population} />
        </div>
        <TermCalendar today={today} term={term} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StaffDonut data={staff} />
        {finance && <DebtorsChart data={debtors} />}
      </div>

      {finance && <PaymentsChart data={series} range={range} />}

      {finance && (
        <TransactionsDrawer
          data={transactions}
          title={drawer.title}
          allLoaded={loadAll}
          getAllHref={`/home?range=${range}&all=1`}
        />
      )}
    </div>
  )
}
