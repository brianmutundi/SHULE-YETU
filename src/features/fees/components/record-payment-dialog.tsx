'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { useFormStatus } from 'react-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { recordPayment, type FeeActionResult } from '../actions'
import { formatMoney } from '../money'
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  referenceLabel,
  referenceRequired,
  type PaymentMethod,
} from '../schema'

const selectClass =
  'h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Recording...' : 'Record payment'}
    </Button>
  )
}

/**
 * Record Payment, then a success dialog with the receipt number and balance.
 *
 * The idempotency key is made when the dialog mounts and renewed only when
 * the parent remounts it for "Record another", so a second tap on Save
 * returns the first receipt.
 */
export function RecordPaymentDialog({
  studentId,
  studentName,
  sessionId,
  today,
  onClose,
  onRecordAnother,
}: {
  studentId: string
  studentName: string
  sessionId: string | null
  /** yyyy-MM-dd in Africa/Nairobi. */
  today: string
  onClose: () => void
  /** The parent remounts this dialog, which resets the form and the key. */
  onRecordAnother: () => void
}) {
  const [state, action] = useActionState<FeeActionResult | null, FormData>(recordPayment, null)
  const [method, setMethod] = useState<PaymentMethod>('mpesa')
  const [key] = useState(() => crypto.randomUUID())

  const fieldError = (name: string) =>
    state && !state.ok ? state.fieldErrors?.[name]?.[0] : undefined

  const done = state?.ok ? state.payment : null

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle>Payment recorded</DialogTitle>
              <DialogDescription>{studentName}</DialogDescription>
            </DialogHeader>

            <dl className="space-y-2 rounded-lg bg-surface-2 p-3 text-sm" aria-live="polite">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Receipt number</dt>
                <dd className="font-mono font-medium">{done.receiptNo}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Amount paid</dt>
                <dd className="font-medium">{formatMoney(done.amount)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Balance</dt>
                <dd className="font-medium">{formatMoney(done.balance)}</dd>
              </div>
              {done.credit > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Credit carried</dt>
                  <dd className="font-medium">{formatMoney(done.credit)}</dd>
                </div>
              )}
            </dl>

            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`/fees/receipts/${done.paymentId}`}>View receipt</Link>
              </Button>
              <Button variant="outline" onClick={onRecordAnother}>
                Record another
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Record Payment</DialogTitle>
              <DialogDescription>{studentName}</DialogDescription>
            </DialogHeader>

            {state && !state.ok && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}

            <form action={action} className="space-y-3" noValidate>
              <input type="hidden" name="studentId" value={studentId} />
              <input type="hidden" name="sessionId" value={sessionId ?? ''} />
              <input type="hidden" name="key" value={key} />

              <div className="space-y-1.5">
                <Label htmlFor="amount">Amount (KES)</Label>
                <Input
                  id="amount"
                  name="amount"
                  inputMode="decimal"
                  placeholder="12,500.00"
                  autoComplete="off"
                  required
                />
                {fieldError('amount') && (
                  <p className="text-xs text-destructive" role="alert">
                    {fieldError('amount')}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="method">Payment method</Label>
                <select
                  id="method"
                  name="method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                  className={selectClass}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reference">
                  {referenceLabel(method)}
                  {referenceRequired(method) && <span className="text-destructive"> *</span>}
                </Label>
                <Input
                  id="reference"
                  name="reference"
                  maxLength={80}
                  autoComplete="off"
                  className={method === 'mpesa' ? 'font-mono uppercase' : undefined}
                />
                {fieldError('reference') && (
                  <p className="text-xs text-destructive" role="alert">
                    {fieldError('reference')}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="paidOn">Date paid</Label>
                <Input id="paidOn" name="paidOn" type="date" defaultValue={today} max={today} />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Submit />
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
