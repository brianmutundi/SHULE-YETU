'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftIcon, PrinterIcon, Share2Icon } from 'lucide-react'
import { Chip } from '@/components/shared/chip'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '../money'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '../schema'
import type { ReceiptData } from '../types'
import { EntryBadge } from './payment-badges'

/**
 * Receipt (CLAUDE.md section 7.12): school header, "Tuition Receipt", learner,
 * chips for class, term, year and receipt number, then the amounts.
 *
 * Print uses the browser, which also saves a PDF. Share uses the device share
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
            <PrinterIcon aria-hidden="true" />
            Print
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
          <h3 className="text-base font-semibold">{isReversal ? 'Reversal Receipt' : 'Tuition Receipt'}</h3>
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

        <dl className="space-y-2 border-t border-border pt-4 text-sm">
          <Row label={isReversal ? 'Amount reversed' : 'Amount paid'} value={money(receipt.amount)} strong />
          <Row label="Balance" value={money(receipt.balance)} />
          {receipt.credit > 0 && <Row label="Credit" value={money(receipt.credit)} />}
          <Row label="Total paid" value={money(receipt.totalPaid)} />
          <Row label="Payment mode" value={methodLabel} />
          {receipt.reference && (
            <Row
              label={receipt.method === 'mpesa' ? 'M-Pesa transaction code' : 'Reference'}
              value={receipt.reference}
              mono
            />
          )}
          <Row label="Date" value={formatDate(receipt.paidAt)} />
          <Row label="Received by" value={receipt.receivedBy ?? 'Not recorded'} />
          {receipt.reason && <Row label="Reason" value={receipt.reason} />}
        </dl>
      </article>
    </div>
  )
}

function Row({
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
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right ${strong ? 'font-semibold' : ''} ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
