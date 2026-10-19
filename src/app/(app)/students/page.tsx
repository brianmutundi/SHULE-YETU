import { getSessionContext } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import { getAcademicPeriod } from '@/lib/auth/period'
import { todayInNairobi } from '@/lib/dates'
import { getStudentBalance, getStudentPaymentPanel } from '@/features/fees/queries'
import { getRegistrationOptions } from '@/features/students/queries'
import { QuickCreateStudent } from '@/features/students/components/quick-create-student'
import {
  getGuardiansWithStudents,
  getMasterStudents,
  getStudentProfile,
} from '@/features/guardians/queries'
import { MasterDetail } from '@/features/students/components/master-detail'
import type { Pane } from '@/features/students/components/master-detail'
import { parseQuickFilters, parseStatusFilter } from '@/features/students/master-filters'

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
  const status = parseStatusFilter(typeof raw.status === 'string' ? raw.status : undefined)
  const quick = parseQuickFilters(typeof raw.quick === 'string' ? raw.quick : undefined)

  const { period } = await getAcademicPeriod()
  const sessionId = period?.sessionId ?? null

  const canEnrol = can(session.role, 'student.enrol')

  // ?pay=record|history is set by the row menu and opens the payment dialogs
  // over the selected learner.
  const payIntent =
    raw.pay === 'record' && can(session.role, 'fee.record')
      ? 'record'
      : raw.pay === 'history' && can(session.role, 'fee.view')
        ? 'history'
        : null

  const [students, guardians, profile, registrationOptions, payments, balance] = await Promise.all([
    getMasterStudents(search, { status, quick }),
    // Only search guardians when the guardians pane is open; otherwise the
    // query would run against a filter the user cannot see.
    getGuardiansWithStudents(pane === 'guardians' ? search : ''),
    pane === 'students' && selectedId ? getStudentProfile(selectedId, sessionId) : Promise.resolve(null),
    canEnrol ? getRegistrationOptions() : Promise.resolve(null),
    // Feeds the payments column (wide screens) and the history dialog (narrow).
    pane === 'students' && selectedId && can(session.role, 'fee.view')
      ? getStudentPaymentPanel(selectedId)
      : Promise.resolve([]),
    // Opening balance for the live Balance field in the Record Payment dialog.
    payIntent === 'record' && selectedId && sessionId
      ? getStudentBalance(selectedId, sessionId)
      : Promise.resolve(null),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
          <p className="text-muted-foreground">
            {pane === 'students'
              ? 'Select a learner to see their record and guardians.'
              : 'Select a guardian to see their details and linked learners.'}
          </p>
        </div>
        {registrationOptions && <QuickCreateStudent options={registrationOptions} />}
      </div>

      <MasterDetail
        pane={pane}
        students={students}
        guardians={guardians}
        profile={profile}
        selectedId={selectedId}
        search={search}
        status={status}
        quick={quick}
        sessionId={sessionId}
        canEdit={can(session.role, 'student.edit')}
        canLink={can(session.role, 'guardian.manage')}
        canRecordPayment={can(session.role, 'fee.record')}
        canViewPayments={can(session.role, 'fee.view')}
        canReverse={can(session.role, 'fee.reverse')}
        payIntent={payIntent}
        payments={payments}
        balance={balance}
        today={todayInNairobi()}
      />
    </div>
  )
}