'use client'

import { useActionState, useState } from 'react'
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
import { reversePayment, type FeeActionResult } from '../actions'
import { formatMoney } from '../money'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? 'Reversing...' : 'Reverse payment'}
    </Button>
  )
}

/** Asks for a reason, then writes the negative entry. Closes itself on success. */
export function ReversePaymentDialog({
  payment,
  onClose,
}: {
  payment: { id: string; receiptNo: string; amount: number }
  onClose: () => void
}) {
  const [state, action] = useActionState<FeeActionResult | null, FormData>(reversePayment, null)

  const [seenState, setSeenState] = useState<FeeActionResult | null>(null)

  // Close on success. Adjusting state during render is the pattern this
  // codebase uses instead of an effect.
  if (state !== seenState) {
    setSeenState(state)
    if (state?.ok) onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reverse payment</DialogTitle>
          <DialogDescription>
            {payment.receiptNo} for {formatMoney(payment.amount)}. This adds a negative entry and
            marks the payment reversed. It cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {state && !state.ok && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <form action={action} className="space-y-3">
          <input type="hidden" name="paymentId" value={payment.id} />
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Input id="reason" name="reason" required minLength={3} maxLength={200} autoComplete="off" />
          </div>
          <div className="flex items-center gap-2">
            <Submit />
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
