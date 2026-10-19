'use client'

import { useState, useSyncExternalStore, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeftIcon, BadgePercentIcon, MarsIcon, UsersIcon, VenusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RecordPaymentDialog } from '@/features/fees/components/record-payment-dialog'
import { StudentPaymentsDialog } from '@/features/fees/components/student-payments-dialog'
import { StudentPaymentsColumn } from '@/features/fees/components/student-payments-column'
import type { PaymentPanelRow } from '@/features/fees/types'
import { AddGuardianDialog } from '@/features/guardians/components/add-guardian-dialog'
import type {
  GuardianWithStudents,
  MasterStudent,
  MasterStudentListItem,
} from '@/features/guardians/queries'
import {
  capitalise,
  STATUS_VALUES,
  toggleQuickFilter,
  type QuickFilter,
  type StatusFilter,
} from '../master-filters'
import { GuardianProfile } from './guardian-profile'
import { GuardianTable } from './guardian-table'
import { StudentList } from './student-list'
import { StudentProfile } from './student-profile'
import type { PaymentIntent } from './student-row-menu'

export type Pane = 'students' | 'guardians'

const XL_QUERY = '(min-width: 80rem)'

/** True from Tailwind's xl breakpoint up. False on the server and first paint. */
function useIsXl(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(XL_QUERY)
      mql.addEventListener('change', notify)
      return () => mql.removeEventListener('change', notify)
    },
    () => window.matchMedia(XL_QUERY).matches,
    () => false,
  )
}

const QUICK_FILTER_UI: { value: QuickFilter; label: string; Icon: typeof MarsIcon }[] = [
  { value: 'male', label: 'Boys only', Icon: MarsIcon },
  { value: 'female', label: 'Girls only', Icon: VenusIcon },
  { value: 'waiver', label: 'Tuition waiver', Icon: BadgePercentIcon },
]

/**
 * Master-detail screen (section 7.3).
 *
 * Selection, pane, status and quick filters all live in the URL so the view
 * is shareable and survives a refresh. Below `lg` only one pane shows at a
 * time: the list, or the detail with a back control.
 */
export function MasterDetail({
  pane,
  students,
  guardians,
  profile,
  selectedId,
  search,
  status,
  quick,
  sessionId,
  canEdit,
  canLink,
  canRecordPayment,
  canViewPayments,
  canReverse,
  payIntent,
  payments,
  balance,
  today,
}: {
  pane: Pane
  students: MasterStudentListItem[]
  guardians: GuardianWithStudents[]
  profile: MasterStudent | null
  selectedId: string | null
  search: string
  status: StatusFilter
  quick: QuickFilter[]
  sessionId: string | null
  canEdit: boolean
  canLink: boolean
  canRecordPayment: boolean
  canViewPayments: boolean
  canReverse: boolean
  /** From ?pay=. Opens the payment dialogs over the selected learner. */
  payIntent: PaymentIntent | null
  payments: PaymentPanelRow[]
  /** Minor units owed this term, or null with no invoice. For Record Payment. */
  balance: number | null
  /** yyyy-MM-dd in Africa/Nairobi. */
  today: string
}) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const searchParams = useSearchParams()
  // Bumped by "Record another" so the dialog remounts with a fresh form and key.
  const [payRound, setPayRound] = useState(0)
  const isXl = useIsXl()
  const [addParentFor, setAddParentFor] = useState<{ id: string; fullName: string } | null>(null)

  /** Apply a patch to the query string. null removes a key. */
  const go = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') params.delete(key)
      else params.set(key, value)
    }
    startTransition(() => {
      router.push(`/students?${params.toString()}`)
    })
  }

  const togglePane = () =>
    // Selection belongs to the other pane, so drop it rather than carrying a
    // learner id across to a guardian list.
    go({ pane: pane === 'students' ? 'guardians' : null, id: null, pay: null })

  const hasSelection = selectedId !== null
  const showingGuardians = pane === 'guardians'
  // The payments column needs a learner and permission; it sits beside the profile.
  const showPaymentsColumn = !showingGuardians && profile !== null && canViewPayments

  return (
    <div
      className={`grid gap-4 ${
        showPaymentsColumn
          ? 'lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)_minmax(0,22rem)]'
          : 'lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]'
      }`}
    >
      {/* Left pane. On narrow screens it hides once something is selected. */}
      <div
        className={`overflow-hidden rounded-xl border border-border bg-surface ${
          hasSelection ? 'hidden lg:block' : ''
        }`}
      >
        <div className="space-y-2 border-b border-border p-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={togglePane}
              aria-label={showingGuardians ? 'Show Students' : 'Show Guardians'}
            >
              <UsersIcon aria-hidden="true" />
              <span className="lg:sr-only">{showingGuardians ? 'Show Students' : 'Show Guardians'}</span>
            </Button>

            <form method="get" action="/students" className="flex-1">
              {showingGuardians && <input type="hidden" name="pane" value="guardians" />}
              <input type="hidden" name="status" value={status} />
              {quick.length > 0 && <input type="hidden" name="quick" value={quick.join(',')} />}
              <Input
                name="search"
                defaultValue={search}
                aria-label={showingGuardians ? 'Search guardians' : 'Search learners'}
                placeholder={showingGuardians ? 'Search guardians' : 'Search learners'}
                className="h-8"
              />
            </form>
          </div>

          {!showingGuardians && (
            <div className="flex items-center gap-2">
              <Select value={status} onValueChange={(value) => go({ status: value, id: null })}>
                <SelectTrigger size="sm" className="w-36" aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {capitalise(s)}
                    </SelectItem>
                  ))}
                  <SelectItem value="all">All statuses</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1" role="group" aria-label="Quick filters">
                {QUICK_FILTER_UI.map(({ value, label, Icon }) => {
                  const on = quick.includes(value)
                  return (
                    <Button
                      key={value}
                      type="button"
                      size="icon-sm"
                      variant={on ? 'default' : 'ghost'}
                      aria-pressed={on}
                      aria-label={label}
                      title={label}
                      onClick={() => {
                        const next = toggleQuickFilter(quick, value)
                        go({ quick: next.length ? next.join(',') : null, id: null })
                      }}
                    >
                      <Icon aria-hidden="true" />
                    </Button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="max-h-[36rem] overflow-y-auto">
          {showingGuardians ? (
            <GuardianTable
              guardians={guardians}
              selectedId={selectedId}
              canManage={canLink}
              onSelect={(id) => go({ id })}
            />
          ) : (
            <StudentList
              students={students}
              selectedId={selectedId}
              sessionId={sessionId}
              perms={{
                canEdit,
                canRecordPayment,
                canViewPayments,
                canManageGuardians: canLink,
              }}
              onSelect={(id) => go({ id, pay: null })}
              onOpenRecord={(id) => router.push(`/students/${id}`)}
              // `pay` is read by the payments panel (fees step); the id keeps
              // the learner selected underneath it.
              onPayment={(id, intent: PaymentIntent) => go({ id, pay: intent })}
              onAddParent={setAddParentFor}
            />
          )}
        </div>
      </div>

      {/* Right pane. On narrow screens it shows only with a selection. */}
      <div
        className={`space-y-3 ${hasSelection ? '' : 'hidden lg:block'} ${pending ? 'opacity-60' : ''}`}
        aria-busy={pending}
      >
        {hasSelection && (
          <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => go({ id: null, pay: null })}>
            <ArrowLeftIcon aria-hidden="true" />
            Back to list
          </Button>
        )}

        {showingGuardians ? (
          <GuardianProfile guardian={guardians.find((g) => g.id === selectedId)} canLink={canLink} />
        ) : profile ? (
          <StudentProfile profile={profile} />
        ) : (
          <p className="text-sm text-muted-foreground">Select a learner to see their record.</p>
        )}
      </div>

      {/* Third column, wide screens only. Narrower screens use the dialog below. */}
      {showPaymentsColumn && profile && (
        <div className="hidden xl:block">
          <StudentPaymentsColumn
            key={profile.id}
            firstName={profile.firstName}
            className={profile.classLabel ?? profile.classAdmitted}
            payments={payments}
            canReverse={canReverse}
          />
        </div>
      )}

      {payIntent === 'record' && profile && (
        <RecordPaymentDialog
          key={`${profile.id}-${payRound}`}
          studentId={profile.id}
          studentName={profile.fullName}
          sessionId={sessionId}
          balance={balance}
          today={today}
          onClose={() => go({ pay: null })}
          onRecordAnother={() => setPayRound((r) => r + 1)}
        />
      )}
      {payIntent === 'history' && profile && !isXl && (
        <StudentPaymentsDialog
          studentId={profile.id}
          studentName={profile.fullName}
          payments={payments}
          canReverse={canReverse}
          onClose={() => go({ pay: null })}
        />
      )}

      {addParentFor && (
        <AddGuardianDialog
          key={addParentFor.id}
          studentId={addParentFor.id}
          studentName={addParentFor.fullName}
          // Duplicate fee payers are refused by the database; this only
          // controls the explanatory hint.
          hasFeePayer={false}
          open
          onOpenChange={(open) => !open && setAddParentFor(null)}
        />
      )}
    </div>
  )
}
