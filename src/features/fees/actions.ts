'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/guards'
import { recordPaymentSchema, reversePaymentSchema } from './schema'
import { asPaymentResult, type PaymentResult } from './types'

export type FeeActionResult =
  | { ok: true; payment: PaymentResult }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

/**
 * Record a payment.
 *
 * Authenticate, authorize, validate, then call the RPC, which is the single
 * transactional write: invoice, receipt number and payment together. The
 * RPC checks the role again, so this guard is a fast failure, not the only one.
 *
 * The idempotency key comes from the form, so a double tap returns the first
 * receipt instead of billing twice.
 */
export async function recordPayment(
  _prev: FeeActionResult | null,
  formData: FormData,
): Promise<FeeActionResult> {
  await requirePermission('fee.record')

  const parsed = recordPaymentSchema.safeParse({
    studentId: formData.get('studentId'),
    amount: formData.get('amount') ?? '',
    method: formData.get('method'),
    reference: formData.get('reference') ?? '',
    paidOn: formData.get('paidOn') ?? '',
    sessionId: formData.get('sessionId') ?? '',
    key: formData.get('key') ?? '',
  })

  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please correct the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const data = parsed.data
  const supabase = await createClient()

  const { data: result, error } = await supabase.rpc('record_payment', {
    p_student: data.studentId,
    p_amount: data.amount,
    p_method: data.method,
    p_reference: data.reference || undefined,
    // A date with no time is taken as midday in Nairobi (+03:00), so it can
    // never slip to the previous day in the receipt's own time zone.
    p_paid_at: data.paidOn ? `${data.paidOn}T12:00:00+03:00` : undefined,
    p_session: data.sessionId || undefined,
    p_key: data.key || undefined,
  })

  if (error || result === null) {
    return { ok: false, error: error?.message ?? 'Could not record the payment.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, payment: asPaymentResult(result) }
}

/** Reverse a payment: a negative entry linked to it, the original marked reversed. */
export async function reversePayment(
  _prev: FeeActionResult | null,
  formData: FormData,
): Promise<FeeActionResult> {
  await requirePermission('fee.reverse')

  const parsed = reversePaymentSchema.safeParse({
    paymentId: formData.get('paymentId'),
    reason: formData.get('reason') ?? '',
  })

  if (!parsed.success) {
    return {
      ok: false,
      error: 'Give a reason for the reversal.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const supabase = await createClient()

  const { data: result, error } = await supabase.rpc('reverse_payment', {
    p_payment: parsed.data.paymentId,
    p_reason: parsed.data.reason,
  })

  if (error || result === null) {
    return { ok: false, error: error?.message ?? 'Could not reverse the payment.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, payment: asPaymentResult(result) }
}
