'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '../money'
import { canBeReversed, PAYMENT_METHOD_LABELS, type PaymentMethod } from '../schema'
import type { PaymentRow } from '../types'
import { EntryBadge } from './payment-badges'
import { ReversePaymentDialog } from './reverse-payment-dialog'

/** Per-student payments panel: every entry, reversals included, with receipt links. */
export function StudentPaymentsDialog({
  studentId,
  studentName,
  payments,
  canReverse,
  onClose,
}: {
  studentId: string
  studentName: string
  payments: PaymentRow[]
  canReverse: boolean
  onClose: () => void
}) {
  const [reversing, setReversing] = useState<PaymentRow | null>(null)

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payments</DialogTitle>
            <DialogDescription>{studentName}</DialogDescription>
          </DialogHeader>

          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <ul role="list" className="divide-y divide-border rounded-lg border border-border">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/fees/receipts/${p.id}`}
                        className="font-mono text-xs underline-offset-4 hover:underline"
                      >
                        {p.receiptNo}
                      </Link>
                      <EntryBadge status={p.status} reversesPaymentId={p.reversesPaymentId} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(p.paidAt)} ·{' '}
                      {PAYMENT_METHOD_LABELS[p.method as PaymentMethod] ?? p.method}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </p>
                    {p.reason && <p className="text-xs text-muted-foreground">Reason: {p.reason}</p>}
                  </div>
                  <span
                    className={`font-medium tabular-nums ${p.amount < 0 ? 'text-destructive' : ''}`}
                  >
                    {formatMoney(p.amount)}
                  </span>
                  {canReverse && canBeReversed(p) && (
                    <Button size="sm" variant="ghost" onClick={() => setReversing(p)}>
                      Reverse
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-end">
            <Button asChild variant="outline" size="sm">
              <Link href={`/fees/statement/${studentId}`}>Fee statement</Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {reversing && (
        <ReversePaymentDialog
          payment={{ id: reversing.id, receiptNo: reversing.receiptNo, amount: reversing.amount }}
          onClose={() => setReversing(null)}
        />
      )}
    </>
  )
}
