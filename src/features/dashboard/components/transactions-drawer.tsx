'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { ReceiptTextIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EntryBadge } from '@/features/fees/components/payment-badges'
import { formatMoney } from '@/features/fees/money'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/features/fees/schema'
import { formatDate } from '@/lib/dates'
import type { Transactions } from '../types'

/**
 * Right-edge transactions drawer: count, running total, the list, Get All.
 * Opening a row goes to its receipt, which opens as a modal over the home
 * screen, so the drawer closes first.
 */
export function TransactionsDrawer({
  data,
  title,
  allLoaded,
  getAllHref,
}: {
  data: Transactions
  /** What the figures cover, e.g. "Today" or "Last 30 days". */
  title: string
  allLoaded: boolean
  getAllHref: string
}) {
  const [open, setOpen] = useState(false)
  const truncated = data.items.length < data.count

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        className="fixed top-1/2 right-0 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-l-xl bg-primary px-2 py-3 text-xs font-medium text-primary-foreground shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring print:hidden"
      >
        <ReceiptTextIcon className="size-4" aria-hidden="true" />
        <span className="[writing-mode:vertical-rl]">Transactions</span>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col gap-4 bg-popover p-4 text-popover-foreground shadow-lg outline-none data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-base font-semibold">Transactions</DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm text-muted-foreground">
                {title}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <XIcon className="size-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-surface-2 p-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Transactions</dt>
              <dd className="text-lg font-semibold tabular-nums">{data.count}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Total</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatMoney(data.total)}</dd>
            </div>
          </dl>

          {data.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No transactions in this period.</p>
          ) : (
            <ul role="list" className="-mx-1 flex-1 divide-y divide-border overflow-y-auto">
              {data.items.map((t) => (
                <li key={t.paymentId}>
                  <Link
                    href={`/fees/receipts/${t.paymentId}`}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 rounded-md px-1 py-2.5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.studentName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{t.studentNo}</span>
                        {t.class ? ` · ${t.class}` : ''}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {formatDate(t.paidAt)} · {PAYMENT_METHOD_LABELS[t.method as PaymentMethod] ?? t.method}
                        <EntryBadge status={t.status} reversesPaymentId={t.reversesPaymentId} />
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium tabular-nums ${t.amount < 0 ? 'text-destructive' : ''}`}>
                        {formatMoney(t.amount)}
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        Bal {formatMoney(t.balance)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {(truncated || !allLoaded) && (
            <Button asChild variant="outline">
              <Link href={getAllHref} scroll={false}>
                Get All
              </Link>
            </Button>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
