'use client'

import { Avatar } from '@/components/shared/avatar'
import { Chip } from '@/components/shared/chip'
import type { MasterStudentListItem } from '@/features/guardians/queries'
import { capitalise } from '../master-filters'
import { StudentRowMenu, type PaymentIntent } from './student-row-menu'

/**
 * One-line rows: avatar, number, name, gender chip, class chip, row menu.
 *
 * Arrow keys move the selection; Enter opens the full record (section 7.3).
 * The row button and the menu button are siblings, never nested.
 */
export function StudentList({
  students,
  selectedId,
  sessionId,
  perms,
  onSelect,
  onOpenRecord,
  onPayment,
  onAddParent,
}: {
  students: MasterStudentListItem[]
  selectedId: string | null
  sessionId: string | null
  perms: {
    canEdit: boolean
    canRecordPayment: boolean
    canViewPayments: boolean
    canManageGuardians: boolean
  }
  onSelect: (id: string) => void
  onOpenRecord: (id: string) => void
  onPayment: (studentId: string, intent: PaymentIntent) => void
  onAddParent: (student: { id: string; fullName: string }) => void
}) {
  if (students.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No learners match.</p>
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    const index = students.findIndex((s) => s.id === selectedId)

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = event.key === 'ArrowDown' ? index + 1 : index - 1
      const target = students[Math.min(Math.max(next, 0), students.length - 1)]
      if (target) onSelect(target.id)
    } else if (event.key === 'Enter' && index >= 0 && event.target === event.currentTarget) {
      onOpenRecord(students[index].id)
    }
  }

  return (
    <ul
      role="list"
      tabIndex={0}
      aria-label="Learners"
      onKeyDown={onKeyDown}
      className="divide-y divide-border focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      {students.map((s) => (
        <li
          key={s.id}
          className={`flex items-center gap-1 pr-1 ${selectedId === s.id ? 'bg-primary-soft' : 'hover:bg-accent'}`}
        >
          <button
            type="button"
            onClick={() => onSelect(s.id)}
            aria-current={selectedId === s.id ? 'true' : undefined}
            className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          >
            <Avatar name={s.fullName} src={s.photoUrl} size="sm" />
            <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
              {s.studentNo}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.fullName}</span>
            <Chip tone="gender" className="hidden sm:inline-flex">
              {capitalise(s.gender)}
            </Chip>
            {s.classLabel && (
              <Chip tone="class" className="hidden sm:inline-flex">
                {s.classLabel}
              </Chip>
            )}
          </button>
          <StudentRowMenu
            student={{ id: s.id, fullName: s.fullName }}
            sessionId={sessionId}
            {...perms}
            onPayment={onPayment}
            onAddParent={onAddParent}
          />
        </li>
      ))}
    </ul>
  )
}
