'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftIcon, DownloadIcon, PrinterIcon, Share2Icon } from 'lucide-react'
import { Chip } from '@/components/shared/chip'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '../money'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '../schema'
import type { ReceiptData } from '../types'
import { EntryBadge } from './payment-badges'

/**
 * Receipt (CLAUDE.md section 7.12): school header, "Payment Receipt", learner,
 * chips for class, term, year and receipt number, bordered boxes for the
 * amounts, Total Paid, a Sign/Stamp line and a thank-you.
 *
 * Print and Export PDF both use the browser's print dialog, which can save a
 * PDF; no PDF library is added for this. Share uses the device share
 * sheet and falls back to copying the link.
 */
export function ReceiptView({ receipt, showBack = true }: { receipt: ReceiptData; showBack?: boolean }) {
  const router = useRouter()
  const [shareNote, setShareNote] = useState('')

  const { school, student } = receipt
  const money = (minor: number) => formatMoney(minor, school.currency)
  const methodLabel = PAYMENT_METHOD_LABELS[receipt.method as PaymentMethod] ?? receipt.method
  const showLogo = typeof school.logoUrl === 'string' && /^https?:\/\//i.test(school.logoUrl)
  const isReversal = receipt.reversesPaymentId !== null

  const share = async () => {
    const url = window.location.href
    const title = `Receipt ${receipt.receiptNo}`
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `${title} for ${student.name}`, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setShareNote('Link copied.')
    } catch {
      // A cancelled share sheet is not an error worth reporting.
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <div className="flex items-center gap-2 print:hidden">
        {showBack && (
          <Button variant="ghost" size="icon" aria-label="Back" onClick={() => router.back()}>
            <ArrowLeftIcon aria-hidden="true" />
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span role="status" className="text-xs text-muted-foreground">
            {shareNote}
          </span>
          <Button variant="outline" size="sm" onClick={() => void share()}>
            <Share2Icon aria-hidden="true" />
            Share
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <DownloadIcon aria-hidden="true" />
            Export PDF
          </Button>
          <Button
            size="icon"
            className="rounded-full"
            aria-label="Print receipt"
            title="Print"
            onClick={() => window.print()}
          >
            <PrinterIcon aria-hidden="true" />
          </Button>
        </div>
      </div>

      <article
        aria-label={`Receipt ${receipt.receiptNo}`}
        className="space-y-5 rounded-xl border border-border bg-surface p-6 print:border-0 print:p-0"
      >
        <header className="flex items-start gap-4">
          {showLogo && (
            // eslint-disable-next-line @next/next/no-img-element -- logo host is not in next.config images
            <img src={school.logoUrl ?? ''} alt="" className="size-14 rounded-md object-contain" />
          )}
          <div className="min-w-0 space-y-0.5">
            <h2 className="text-lg font-semibold">{school.name}</h2>
            {school.address && <p className="text-sm text-muted-foreground">{school.address}</p>}
            {(school.phone || school.email) && (
              <p className="text-sm text-muted-foreground">
                {[school.phone, school.email].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </header>

        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">{isReversal ? 'Reversal Receipt' : 'Payment Receipt'}</h3>
          <EntryBadge status={receipt.status} reversesPaymentId={receipt.reversesPaymentId} />
        </div>

        <div>
          <p className="text-sm text-muted-foreground">Received from</p>
          <p className="font-medium">{student.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{student.studentNo}</p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {student.class && <Chip tone="class">{student.class}</Chip>}
          <Chip tone="neutral">{receipt.term}</Chip>
          <Chip tone="neutral">{receipt.year}</Chip>
          <Chip tone="relation" className="font-mono">
            {receipt.receiptNo}
          </Chip>
        </div>

        <dl className="grid grid-cols-2 gap-2 border-t border-border pt-4 text-sm">
          <Box label={isReversal ? 'Amount Reversed' : 'Amount Paid'} value={money(receipt.amount)} strong />
          <Box label="Balance" value={money(receipt.balance)} />
          <Box label="Payment Mode" value={methodLabel} />
          <Box label="Payment Date" value={formatDate(receipt.paidAt)} />
          <Box label="Received By" value={receipt.receivedBy ?? 'Not recorded'} />
          {receipt.reference && (
            <Box
              label={receipt.method === 'mpesa' ? 'M-Pesa Transaction Code' : 'Reference'}
              value={receipt.reference}
              mono
            />
          )}
          {receipt.credit > 0 && <Box label="Credit" value={money(receipt.credit)} />}
          {receipt.reason && <Box label="Reason" value={receipt.reason} />}
        </dl>

        <div className="flex items-baseline justify-between gap-4 border-t border-border pt-4">
          <span className="text-sm text-muted-foreground">Total Paid</span>
          <span className="text-lg font-semibold tabular-nums">{money(receipt.totalPaid)}</span>
        </div>

        <div className="pt-6">
          <div className="h-px w-48 bg-foreground/60" aria-hidden="true" />
          <p className="mt-1 text-xs text-muted-foreground">Sign / Stamp</p>
        </div>

        <p className="text-center text-sm text-muted-foreground">Thank you for your payment.</p>
      </article>
    </div>
  )
}

function Box({
  label,
  value,
  strong,
  mono,
}: {
  label: string
  value: string
  strong?: boolean
  mono?: boolean
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 break-words ${strong ? 'font-semibold' : ''} ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  )
}
