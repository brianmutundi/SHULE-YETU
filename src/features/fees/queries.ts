import 'server-only'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fullNameOf } from '@/features/students/name'
import {
  asReceipt,
  asStatement,
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
