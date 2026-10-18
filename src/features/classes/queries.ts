import 'server-only'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAcademicPeriod } from '@/lib/auth/period'

export interface ClassRow {
  id: string
  label: string
  stage: string
  stageName: string
  sortOrder: number
  nextClassId: string | null
  streams: { id: string; label: string; fullName: string }[]
}

/**
 * Classes and their streams for a given academic year.
 *
 * Read in one query so the table renders without a per-row fetch. Streams are
 * scoped to the year, which is what makes cloning them forward meaningful.
 */
export async function getClassesWithStreams(academicYearId: string): Promise<ClassRow[]> {
  await connection()

  const supabase = await createClient()

  const [{ data: classes }, { data: levels }, { data: streams }] = await Promise.all([
    supabase
      .from('classes')
      .select('id, label, level_id, sort_order, next_class_id')
      .order('sort_order'),
    supabase.from('levels').select('id, stage, name'),
    supabase
      .from('streams')
      .select('id, class_id, stream_label, full_name')
      .eq('academic_year_id', academicYearId)
      .order('stream_label'),
  ])

  const levelById = new Map((levels ?? []).map((l) => [l.id, l]))

  return (classes ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    stage: row.level_id ? (levelById.get(row.level_id)?.stage ?? '') : '',
    stageName: row.level_id ? (levelById.get(row.level_id)?.name ?? '') : '',
    sortOrder: row.sort_order,
    nextClassId: row.next_class_id,
    streams: (streams ?? [])
      .filter((s) => s.class_id === row.id)
      .map((s) => ({ id: s.id, label: s.stream_label, fullName: s.full_name })),
  }))
}

/** Resolve the period the Classes screen should show. */
export async function getSelectedYear() {
  const { period, years } = await getAcademicPeriod()
  return { period, years }
}