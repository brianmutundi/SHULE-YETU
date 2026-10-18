import { z } from 'zod'

/**
 * Attendance (CLAUDE.md section 7.11).
 *
 * Four statuses. Excused carries a reason because "excused" without one is
 * indistinguishable from a missed register, and that distinction is the point of
 * having it.
 */

export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused'] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]

export const EXCUSE_REASONS = ['sick', 'permission', 'other'] as const
export type ExcuseReason = (typeof EXCUSE_REASONS)[number]

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  excused: 'Excused',
}

export const EXCUSE_REASON_LABELS: Record<ExcuseReason, string> = {
  sick: 'Sick',
  permission: 'Permission',
  other: 'Other',
}

/** One row of the marking sheet. */
export interface SheetRow {
  studentId: string
  studentNo: string
  fullName: string
  photoUrl: string | null
  /** Null until the teacher marks this learner. */
  status: AttendanceStatus | null
  excuseReason: ExcuseReason | null
  note: string | null
  markedAt: string | null
  /** Attendance rate to date, as a percentage. */
  rate: number | null
}

/** One learner's mark, as the client sends it. */
export const attendanceEntrySchema = z.object({
  studentId: z.string().uuid(),
  status: z.enum(ATTENDANCE_STATUSES),
  excuseReason: z.enum(EXCUSE_REASONS).optional().or(z.literal('')),
  note: z.string().max(200).optional().or(z.literal('')),
})

/**
 * The batched save.
 *
 * Discriminated on whether a reason is needed, so the requirement is in the
 * type rather than in a runtime check the caller might skip.
 */
export const attendanceBatchSchema = z
  .object({
    streamId: z.string().uuid('Choose a class'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date'),
    entries: z.array(attendanceEntrySchema).min(1, 'Mark at least one learner'),
  })
  .superRefine((batch, ctx) => {
    for (const [index, entry] of batch.entries.entries()) {
      if (entry.status === 'excused' && !entry.excuseReason) {
        ctx.addIssue({
          code: 'custom',
          path: ['entries', index, 'excuseReason'],
          message: 'An excused absence needs a reason',
        })
      }
      // A reason on a learner who is present is a mis-clicked field, and storing
      // it would make the register disagree with itself.
      if (entry.status !== 'excused' && entry.excuseReason) {
        ctx.addIssue({
          code: 'custom',
          path: ['entries', index, 'excuseReason'],
          message: 'Only an excused absence carries a reason',
        })
      }
    }
  })

export type AttendanceBatch = z.infer<typeof attendanceBatchSchema>

export interface SaveOutcome {
  studentId: string
  outcome: 'failed' | 'skipped'
  message: string
}

export type SaveResult =
  | { ok: true; saved: number; skipped: number; outcomes: SaveOutcome[] }
  | { ok: false; error: string }

/** Stream picker. */
export const attendanceQuerySchema = z.object({
  streamId: z.string().uuid().optional().or(z.literal('')),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')
    .optional()
    .or(z.literal('')),
})

export type AttendanceQuery = z.infer<typeof attendanceQuerySchema>

/**
 * Attendance rate thresholds for the rate bar ([A7] is unconfirmed).
 *
 * These are presentation only. The threshold does not gate promotion or
 * reporting anywhere, so choosing the wrong colours costs a school a little
 * visual confidence and nothing else.
 */
export const GOOD_ATTENDANCE_RATE = 90
export const FAIR_ATTENDANCE_RATE = 75

export function attendanceTone(rate: number | null): 'good' | 'fair' | 'poor' | 'none' {
  if (rate === null) return 'none'
  if (rate >= GOOD_ATTENDANCE_RATE) return 'good'
  if (rate >= FAIR_ATTENDANCE_RATE) return 'fair'
  return 'poor'
}