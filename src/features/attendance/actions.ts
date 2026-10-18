'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/guards'
import { attendanceBatchSchema, type SaveOutcome, type SaveResult } from './schema'

/**
 * Attendance actions (CLAUDE.md section 7.11).
 *
 * One batched save for a whole stream on one date. A teacher marking 40
 * learners should not produce 40 round trips, and a half-marked register is
 * worse than an unmarked one, so the write is one transaction on the server.
 *
 * The per-learner outcome is returned rather than collapsed into a single
 * number: a teacher told "38 saved" has to be able to find the two that did not,
 * and a bare count would not tell them which.
 */
export async function saveAttendance(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  await requirePermission('attendance.mark')

  // The sheet arrives as a JSON string rather than repeated form fields, so the
  // batch keeps its shape on the way to the RPC and the entries cannot be
  // reordered or interleaved with another learner's fields.
  let entries: unknown = []
  try {
    entries = JSON.parse(String(formData.get('entries') ?? '[]'))
  } catch {
    return { ok: false, error: 'The register could not be read. Reload and try again.' }
  }

  const parsed = attendanceBatchSchema.safeParse({
    streamId: formData.get('streamId'),
    date: formData.get('date'),
    entries,
  })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const { streamId, date, entries: batch } = parsed.data
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('save_attendance', {
    p_stream: streamId,
    p_date: date,
    p_entries: batch.map((entry) => ({
      studentId: entry.studentId,
      status: entry.status,
      excuseReason: entry.excuseReason || undefined,
      note: entry.note || undefined,
    })),
  })

  if (error) {
    // "not assigned to that class" is the realistic refusal, and the database
    // message is already a sentence written for a teacher.
    return { ok: false, error: error.message }
  }

  const result = data as unknown as {
    saved: number
    skipped: number
    errors: SaveOutcome[]
  }

  revalidatePath('/', 'layout')

  return {
    ok: true,
    saved: result.saved,
    skipped: result.skipped,
    outcomes: result.errors ?? [],
  }
}