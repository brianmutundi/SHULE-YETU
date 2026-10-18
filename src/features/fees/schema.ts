import { z } from 'zod'
import { MAX_PAYMENT_MINOR, parseMoneyToMinor } from './money'

export const PAYMENT_METHODS = ['mpesa', 'cash', 'bank', 'cheque', 'bursary', 'sponsor'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  mpesa: 'M-Pesa',
  cash: 'Cash',
  bank: 'Bank deposit',
  cheque: 'Cheque',
  bursary: 'Bursary',
  sponsor: 'Sponsor',
}

/** Methods whose reference (code, slip or cheque number) the database requires. */
const REFERENCE_REQUIRED: readonly PaymentMethod[] = ['mpesa', 'bank', 'cheque']

export function referenceRequired(method: PaymentMethod): boolean {
  return REFERENCE_REQUIRED.includes(method)
}

export function referenceLabel(method: PaymentMethod): string {
  switch (method) {
    case 'mpesa':
      return 'M-Pesa transaction code'
    case 'bank':
      return 'Bank slip reference'
    case 'cheque':
      return 'Cheque number'
    case 'bursary':
    case 'sponsor':
      return 'Paying organisation'
    default:
      return 'Reference (optional)'
  }
}

export const recordPaymentSchema = z
  .object({
    studentId: z.string().uuid('Select a learner'),
    amount: z
      .string()
      .transform((value, ctx) => {
        const minor = parseMoneyToMinor(value)
        if (minor === null || minor <= 0) {
          ctx.addIssue({ code: 'custom', message: 'Enter an amount such as 12500 or 12,500.50' })
          return z.NEVER
        }
        if (minor > MAX_PAYMENT_MINOR) {
          ctx.addIssue({ code: 'custom', message: 'That amount is above KES 10,000,000. Check it.' })
          return z.NEVER
        }
        return minor
      }),
    method: z.enum(PAYMENT_METHODS),
    reference: z.string().trim().max(80).optional().or(z.literal('')),
    /** yyyy-MM-dd; blank means now. */
    paidOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the payment date')
      .optional()
      .or(z.literal('')),
    sessionId: z.string().uuid().optional().or(z.literal('')),
    key: z.string().trim().max(80).optional().or(z.literal('')),
  })
  .superRefine((value, ctx) => {
    if (referenceRequired(value.method) && !value.reference?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['reference'],
        message: `Enter the ${referenceLabel(value.method).toLowerCase()}`,
      })
    }
  })

export type RecordPaymentValues = z.output<typeof recordPaymentSchema>

export const reversePaymentSchema = z.object({
  paymentId: z.string().uuid(),
  reason: z.string().trim().min(3, 'Give a reason for the reversal').max(200),
})

export type EntryKind = 'payment' | 'reversal' | 'reversed'

/**
 * How a payment row should be badged. The negative entry is the "reversal";
 * the original it cancelled is "reversed".
 */
export function entryKind(row: {
  status: string
  reversesPaymentId: string | null
}): EntryKind {
  if (row.reversesPaymentId) return 'reversal'
  if (row.status === 'reversed') return 'reversed'
  return 'payment'
}

/** Only an unreversed, original payment can be reversed. */
export function canBeReversed(row: { status: string; reversesPaymentId: string | null }): boolean {
  return entryKind(row) === 'payment'
}

/** RCP-YY-NNNNNN, the format app.next_receipt_no() produces. */
export const RECEIPT_NO_PATTERN = /^RCP-\d{2}-\d{6}$/
