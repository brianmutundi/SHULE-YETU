import 'server-only'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { StaffDimension } from './format'
import type {
  BreakdownRow,
  DebtorRow,
  Kpis,
  PopulationRow,
  SeriesPoint,
  Transactions,
} from './types'

/**
 * Dashboard reads. Every widget is one RPC (CLAUDE.md section 7.2): nothing
 * here, and nothing in the page, adds up rows. The database does the counting,
 * so a school with thousands of learners costs the same as one with fifty.
 */

export async function getKpis(sessionId: string | null): Promise<Kpis> {
  await connection()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('dashboard_kpis', { p_session: sessionId ?? undefined })
  if (error) throw new Error(error.message)
  return data as unknown as Kpis
}

export async function getPopulation(): Promise<PopulationRow[]> {
  await connection()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('dashboard_population')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({ classLabel: r.class_label, boys: r.boys, girls: r.girls }))
}

export async function getStaffBreakdown(dimension: StaffDimension): Promise<BreakdownRow[]> {
  await connection()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('dashboard_staff_breakdown', { p_dimension: dimension })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({ label: r.label, value: r.value }))
}

export async function getDebtors(sessionId: string | null): Promise<DebtorRow[]> {
  await connection()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('dashboard_debtors', { p_session: sessionId ?? undefined })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({ label: r.label, debtors: r.debtors, owed: r.owed }))
}

export async function getPaymentsSeries(
  from: string,
  to: string,
  bucket: 'day' | 'week' | 'month',
): Promise<SeriesPoint[]> {
  await connection()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('dashboard_payments_series', {
    p_from: from,
    p_to: to,
    p_bucket: bucket,
  })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({ bucket: r.bucket, total: r.total, entryCount: r.entry_count }))
}

export async function getTransactions(from: string, to: string, limit: number): Promise<Transactions> {
  await connection()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('dashboard_transactions', {
    p_from: from,
    p_to: to,
    p_limit: limit,
  })
  if (error) throw new Error(error.message)
  return data as unknown as Transactions
}
