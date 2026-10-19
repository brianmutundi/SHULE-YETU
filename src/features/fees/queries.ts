import 'server-only'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fullNameOf } from '@/features/students/name'
import {
  asReceipt,
  asStatement,
  type PaymentPanelRow,
  type PaymentRow,
  type ReceiptData,
  type StatementData,
} from './types'

/** Every payment entry for a learner, newest first, reversals included. */
export async function getStudentPayments(studentId: string): Promise<PaymentRow[]> {
  await connection()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('payments')
    .select('id, receipt_no, amount, method, reference, paid_at, status, reverses_payment_id, reason')
    .eq('student_id', studentId)
    .order('paid_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(error.message)

  return (data ?? []).map((p) => ({
    id: p.id,
    receiptNo: p.receipt_no,
    amount: p.amount,
    method: p.method,
    reference: p.reference,
    paidAt: p.paid_at,
    status: p.status,
    reversesPaymentId: p.reverses_payment_id,
    reason: p.reason,
  }))
}

/**
 * Payments for the Students payments column: each entry with its term and the
 * invoice balance. Four small queries instead of one nested select, so the
 * hand-written table types do not need relationships.
 */
export async function getStudentPaymentPanel(studentId: string): Promise<PaymentPanelRow[]> {
  const rows = await getStudentPayments(studentId)
  if (rows.length === 0) return []

  const supabase = await createClient()

  const { data: pays, error: payErr } = await supabase
    .from('payments')
    .select('id, invoice_id')
    .eq('student_id', studentId)
  if (payErr) throw new Error(payErr.message)
  const invoiceOf = new Map<string, string>((pays ?? []).map((p) => [p.id, p.invoice_id]))

  const invoiceIds = [...new Set([...invoiceOf.values()])]
  const [{ data: invoices }, { data: balances }] = await Promise.all([
    supabase.from('invoices').select('id, session_id').in('id', invoiceIds),
    supabase.from('student_balances').select('invoice_id, balance').in('invoice_id', invoiceIds),
  ])
  const sessionOfInvoice = new Map<string, string>((invoices ?? []).map((i) => [i.id, i.session_id]))
  const balanceOfInvoice = new Map<string, number | null>(
    (balances ?? []).flatMap((b) => (b.invoice_id ? [[b.invoice_id, b.balance] as const] : [])),
  )

  const sessionIds = [...new Set([...sessionOfInvoice.values()])]
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, term_number, academic_year_id')
    .in('id', sessionIds)
  const yearIds = [...new Set((sessions ?? []).map((s) => s.academic_year_id))]
  const { data: years } = await supabase
    .from('academic_years')
    .select('id, calendar_year')
    .in('id', yearIds)
  const yearOf = new Map<string, number>((years ?? []).map((y) => [y.id, y.calendar_year]))
  const termOfSession = new Map<string, string>(
    (sessions ?? []).map((s) => [
      s.id,
      yearOf.has(s.academic_year_id)
        ? `Term ${s.term_number} \u2022 ${yearOf.get(s.academic_year_id)}`
        : `Term ${s.term_number}`,
    ]),
  )

  return rows.map((r) => {
    const invoiceId = invoiceOf.get(r.id)
    const sessionId = invoiceId ? sessionOfInvoice.get(invoiceId) : undefined
    return {
      ...r,
      termLabel: sessionId ? (termOfSession.get(sessionId) ?? null) : null,
      balance: invoiceId ? (balanceOfInvoice.get(invoiceId) ?? null) : null,
    }
  })
}

/** One receipt, or null when it does not exist or is outside this school. */
export async function getReceipt(paymentId: string): Promise<ReceiptData | null> {
  await connection()

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('payment_receipt', { p_payment: paymentId })

  // P0002 is the function's "not found": show a 404, not a crash.
  if (error) {
    if (error.code === 'P0002') return null
    throw new Error(error.message)
  }
  return data === null ? null : asReceipt(data)
}

/** A learner's fee statement for one term; null when they have no invoice. */
export async function getFeeStatement(
  studentId: string,
  sessionId: string,
): Promise<StatementData | null> {
  await connection()

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fee_statement', {
    p_student: studentId,
    p_session: sessionId,
  })

  if (error) throw new Error(error.message)
  return asStatement(data)
}

/** Name and admission number for a statement header; null outside this school. */
export async function getStudentHeader(
  studentId: string,
): Promise<{ id: string; studentNo: string; fullName: string } | null> {
  await connection()

  const supabase = await createClient()
  const { data } = await supabase
    .from('students')
    .select('id, student_no, first_name, other_names, surname')
    .eq('id', studentId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!data) return null
  return {
    id: data.id,
    studentNo: data.student_no,
    fullName: fullNameOf(data.first_name, data.other_names, data.surname),
  }
}
