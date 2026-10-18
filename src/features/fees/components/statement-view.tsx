'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeftIcon, PrinterIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '../money'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '../schema'
import type { StatementData } from '../types'
import { EntryBadge } from './payment-badges'

/** Fee payment statement: what was billed, every payment entry, what is owed. */
export function StatementView({
  student,
  termLabel,
  statement,
}: {
  student: { fullName: string; studentNo: string }
  termLabel: string
  statement: StatementData | null
}) {
  const router = useRouter()

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="flex items-center gap-2 print:hidden">
        <Button variant="ghost" size="icon" aria-label="Back" onClick={() => router.back()}>
          <ArrowLeftIcon aria-hidden="true" />
        </Button>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => window.print()}>
          <PrinterIcon aria-hidden="true" />
          Print
        </Button>
      </div>

      <article className="space-y-5 rounded-xl border border-border bg-surface p-6 print:border-0 print:p-0">
        <header>
          <h2 className="text-lg font-semibold">Fee payment statement</h2>
          <p className="text-sm">
            {student.fullName} <span className="font-mono text-muted-foreground">{student.studentNo}</span>
          </p>
          <p className="text-sm text-muted-foreground">{termLabel}</p>
        </header>

        {statement === null ? (
          <p className="text-sm text-muted-foreground">No invoice has been raised for this term yet.</p>
        ) : (
          <>
            <section aria-labelledby="billed-heading">
              <h3 id="billed-heading" className="mb-2 text-sm font-medium">
                Billed
              </h3>
              {statement.lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No fee items matched this learner.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    {statement.lines.map((l, i) => (
                      <tr key={`${l.description}-${i}`}>
                        <td className="py-1.5">
                          {l.description}
                          {l.waived && <span className="ml-2 text-xs text-muted-foreground">(waived)</span>}
                        </td>
                        <td
                          className={`py-1.5 text-right tabular-nums ${l.waived ? 'text-muted-foreground line-through' : ''}`}
                        >
                          {formatMoney(l.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section aria-labelledby="payments-heading">
              <h3 id="payments-heading" className="mb-2 text-sm font-medium">
                Payments
              </h3>
              {statement.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments yet.</p>
              ) : (
                <ul role="list" className="divide-y divide-border text-sm">
                  {statement.payments.map((p) => (
                    <li key={p.paymentId} className="flex flex-wrap items-center gap-x-3 py-1.5">
                      <span className="font-mono text-xs">{p.receiptNo}</span>
                      <EntryBadge status={p.status} reversesPaymentId={p.reversesPaymentId} />
                      <span className="text-xs text-muted-foreground">
                        {formatDate(p.paidAt)} · {PAYMENT_METHOD_LABELS[p.method as PaymentMethod] ?? p.method}
                      </span>
                      <span
                        className={`ml-auto tabular-nums ${p.amount < 0 ? 'text-destructive' : ''}`}
                      >
                        {formatMoney(p.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <dl className="space-y-1 border-t border-border pt-3 text-sm">
              <Total label="Billed" value={formatMoney(statement.billed)} />
              <Total label="Paid" value={formatMoney(statement.paid)} />
              {statement.credit > 0 && <Total label="Credit" value={formatMoney(statement.credit)} />}
              <Total label="Balance" value={formatMoney(statement.balance)} strong />
            </dl>
          </>
        )}
      </article>
    </div>
  )
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-semibold' : ''}`}>{value}</dd>
    </div>
  )
}
