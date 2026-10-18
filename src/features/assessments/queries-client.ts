import { createClient } from '@/lib/supabase/client'
import type { GridRow } from './schema'

/**
 * Client-side assessment reads.
 *
 * Uses the browser Supabase client rather than the server client.
 */

export async function getMarksGrid(taskId: string, streamId: string): Promise<GridRow[]> {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('marks_grid', {
    p_task: taskId,
    p_stream: streamId,
  })

  if (error) throw new Error(error.message)

  return ((data ?? []) as {
    student_id: string
    student_no: string
    full_name: string
    performance_level_code: string | null
    score: number | null
    note: string | null
    graded_at: string | null
  }[]).map((r) => ({
    studentId: r.student_id,
    studentNo: r.student_no,
    fullName: r.full_name,
    performanceLevelCode: r.performance_level_code,
    score: r.score === null ? null : Number(r.score),
    note: r.note,
    gradedAt: r.graded_at,
  }))
}