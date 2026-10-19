'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PrinterIcon, Undo2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/shared/chip'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '../money'
import { canBeReversed } from '../schema'
import type { PaymentPanelRow } from '../types'
import { EntryBadge } from './payment-badges'
import { ReversePaymentDialog } from './reverse-payment-dialog'

/** Entries shown before "Get All". */
const INITIAL_COUNT = 5

/**
 * Third column of the Students page: one learner's payments as cards.
 * Reuses ReversePaymentDialog, so the reversal rules live in one place.
 */
export function StudentPaymentsColumn({
  firstName,
  className,
  payments,
  canReverse,
}: {
  firstName: string
  /** The learner's current class, shown on every card. */
  className: string | null
  payments: PaymentPanelRow[]
  canReverse: boolean
}) {
  const [showAll, setShowAll] = useState(false)
  const [reversing, setReversing] = useState<PaymentPanelRow | null>(null)

  const visible = showAll ? payments : payments.slice(0, INITIAL_COUNT)
  const hidden = payments.length - visible.length

  return (
    <section aria-label={`${firstName}'s payments`} className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{firstName}&apos;s Payments</h2>
        {hidden > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={() => setShowAll(true)}>
            Get All ({payments.length})
          </Button>
        )}
      </div>

      {payments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          No payments recorded yet.
        </p>
      ) : (
        <ul role="list" className="space-y-2">
          {visible.map((p) => {
            const isReversal = p.reversesPaymentId !== null
            return (
              <li key={p.id} className="space-y-2 rounded-xl border border-border bg-surface p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{p.termLabel ?? 'Payment'} Payment</p>
                  <span
                    className={`font-semibold tabular-nums ${p.amount < 0 ? 'text-destructive' : ''}`}
                  >
                    {formatMoney(p.amount)}
                  </span>
                </div>

                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <dt>Class</dt>
                  <dd className="text-foreground">{className ?? 'Not recorded'}</dd>
                  <dt>Date Paid</dt>
                  <dd className="text-foreground">{formatDate(p.paidAt)}</dd>
                  <dt>Receipt</dt>
                  <dd className="font-mono text-foreground">{p.receiptNo}</dd>
                </dl>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Text on every chip: colour is never the only signal. */}
                  {!isReversal && p.status === 'posted' && <Chip tone="class">Paid</Chip>}
                  <EntryBadge status={p.status} reversesPaymentId={p.reversesPaymentId} />
                  {p.balance !== null && !isReversal && (
                    <Chip tone="warning">Balance {formatMoney(p.balance)}</Chip>
                  )}

                  <span className="ml-auto flex items-center gap-1">
                    {canReverse && canBeReversed(p) && (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Reverse receipt ${p.receiptNo}`}
                        title="Reverse payment"
                        onClick={() => setReversing(p)}
                      >
                        <Undo2Icon aria-hidden="true" />
                      </Button>
                    )}
                    <Button
                      asChild
                      size="icon-sm"
                      aria-label={`Print receipt ${p.receiptNo}`}
                      title="Receipt"
                    >
                      <Link href={`/fees/receipts/${p.id}`}>
                        <PrinterIcon aria-hidden="true" />
                      </Link>
                    </Button>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {reversing && (
        <ReversePaymentDialog
          payment={{ id: reversing.id, receiptNo: reversing.receiptNo, amount: reversing.amount }}
          onClose={() => setReversing(null)}
        />
      )}
    </section>
  )
}
