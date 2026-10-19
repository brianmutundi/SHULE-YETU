import type { Json } from '@/lib/supabase/types'

/** What record_payment and reverse_payment return. Amounts are minor units. */
export interface PaymentResult {
  paymentId: string
  receiptNo: string
  amount: number
  method: string
  status: string
  reversesPaymentId: string | null
  balance: number
  credit: number
  totalPaid: number
}

export interface ReceiptData {
  paymentId: string
  receiptNo: string
  amount: number
  method: string
  reference: string | null
  paidAt: string
  status: string
  reversesPaymentId: string | null
  reason: string | null
  receivedBy: string | null
  school: {
    name: string
    logoUrl: string | null
    address: string | null
    phone: string | null
    email: string | null
    currency: string
  }
  student: { id: string; studentNo: string; name: string; class: string | null }
  term: string
  year: number
  balance: number
  credit: number
  totalPaid: number
}

export interface StatementData {
  invoice: { id: string; total: number; creditApplied: number; status: string }
  lines: { description: string; voteHead: string; amount: number; waived: boolean }[]
  payments: {
    paymentId: string
    receiptNo: string
    amount: number
    method: string
    reference: string | null
    paidAt: string
    status: string
    reversesPaymentId: string | null
  }[]
  billed: number
  paid: number
  credit: number
  balance: number
}

export interface PaymentRow {
  id: string
  receiptNo: string
  amount: number
  method: string
  reference: string | null
  paidAt: string
  status: string
  reversesPaymentId: string | null
  reason: string | null
}

/**
 * A payment as the Students payments column shows it: the entry plus the
 * term it was billed in and what the learner still owes on that invoice.
 * balance is the invoice's current balance, not a running balance at the
 * time of the payment.
 */
export interface PaymentPanelRow extends PaymentRow {
  /** "Term 1 • 2026", or null when the invoice's term cannot be read. */
  termLabel: string | null
  /** Minor units still owed on this payment's invoice; null when unknown. */
  balance: number | null
}

/**
 * The RPCs return jsonb, which the generated types call Json. The shapes are
 * fixed by the SQL in 20261018010100_fees.sql, so they are narrowed here, in
 * one place, rather than cast at each call site.
 */
export function asPaymentResult(value: Json): PaymentResult {
  return value as unknown as PaymentResult
}

export function asReceipt(value: Json): ReceiptData {
  return value as unknown as ReceiptData
}

export function asStatement(value: Json | null): StatementData | null {
  return value === null ? null : (value as unknown as StatementData)
}
