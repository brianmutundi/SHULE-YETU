'use client'

import Link from 'next/link'
import { EllipsisVerticalIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type PaymentIntent = 'record' | 'history'

/**
 * Per-row actions: Edit, Record Payment, Get Payments, Get reports, Add Parent.
 *
 * Each item is shown only if the role could actually do it. The server action
 * behind each one still authorizes on its own.
 */
export function StudentRowMenu({
  student,
  sessionId,
  canEdit,
  canRecordPayment,
  canViewPayments,
  canManageGuardians,
  onPayment,
  onAddParent,
}: {
  student: { id: string; fullName: string }
  sessionId: string | null
  canEdit: boolean
  canRecordPayment: boolean
  canViewPayments: boolean
  canManageGuardians: boolean
  onPayment: (studentId: string, intent: PaymentIntent) => void
  onAddParent: (student: { id: string; fullName: string }) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${student.fullName}`}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <EllipsisVerticalIcon className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {canEdit && (
          <DropdownMenuItem asChild>
            <Link href={`/students/${student.id}`}>Edit</Link>
          </DropdownMenuItem>
        )}
        {canRecordPayment && (
          <DropdownMenuItem onSelect={() => onPayment(student.id, 'record')}>
            Record Payment
          </DropdownMenuItem>
        )}
        {canViewPayments && (
          <DropdownMenuItem onSelect={() => onPayment(student.id, 'history')}>
            Get Payments
          </DropdownMenuItem>
        )}
        {sessionId ? (
          <DropdownMenuItem asChild>
            <a href={`/api/report-cards/${student.id}/${sessionId}`} target="_blank" rel="noreferrer">
              Get reports
            </a>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>Get reports</DropdownMenuItem>
        )}
        {canManageGuardians && (
          <DropdownMenuItem onSelect={() => onAddParent(student)}>Add Parent</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
