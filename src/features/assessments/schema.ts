import { z } from 'zod'

/**
 * Assessments (CLAUDE.md section 7.15).
 *
 * The mode split is real, not cosmetic. Basic mode records a competency level
 * per learner per task on an ordinal scale; senior mode records a numeric score.
 * An eight-point ordinal cannot be averaged into a total, and a percentage
 * cannot be mapped back onto a competency without losing information, so the
 * schema carries both and this module never pretends one can stand in for the
 * other.
 */

export const TASK_CATEGORIES = [
  'formative',
  'summative',
  'continuous',
  'end_of_term',
  'culminating',
] as const
export type TaskCategory = (typeof TASK_CATEGORIES)[number]

/** Categories each mode is allowed to use. Mirrors app.guard_assessment_task_mode(). */
export const BASIC_CATEGORIES = ['formative', 'summative'] as const
export const SENIOR_CATEGORIES = ['continuous', 'end_of_term', 'culminating'] as const

export function categoriesForMode(mode: 'basic' | 'senior') {
  return mode === 'senior' ? SENIOR_CATEGORIES : BASIC_CATEGORIES
}

export const CATEGORY_LABELS: Record<TaskCategory, string> = {
  formative: 'Formative',
  summative: 'Summative',
  continuous: 'Continuous assessment',
  end_of_term: 'End of term exam',
  culminating: 'Senior School culminating',
}

export const EIGHT_POINT_CODES = ['EE1', 'EE2', 'EE3', 'ME1', 'ME2', 'ME3', 'BE1', 'BE2'] as const
export const FOUR_POINT_CODES = ['E1', 'E2', 'M1', 'M2'] as const

/** Canonical order on the scale, best to weakest. Drives the grid layout. */
export const SCALE_ORDER: readonly string[] = [...EIGHT_POINT_CODES, ...FOUR_POINT_CODES]

export function isEightPointCode(code: string): boolean {
  return (EIGHT_POINT_CODES as readonly string[]).includes(code)
}

/**
 * Band a level code, for the report card's summary.
 *
 * The thresholds are the shape of the CBC scale rather than a policy claim:
 * EE is Exceeds, ME is Meets, BE is Below.
 */
export type PerformanceBand = 'exceeds' | 'meets' | 'below'

export function bandFor(code: string): PerformanceBand | null {
  if (code.startsWith('EE')) return 'exceeds'
  if (code.startsWith('ME') || code === 'M1' || code === 'M2') return 'meets'
  if (code.startsWith('BE') || code === 'E1' || code === 'E2') {
    // On the four-point scale E1/E2 are the top band, M1/M2 the middle.
    if (code === 'E1' || code === 'E2') return 'exceeds'
    return 'meets'
  }
  return null
}

/* ------------------------------------------------------------------ *
 * Rubric
 * ------------------------------------------------------------------ */

export const performanceLevelSchema = z.object({
  id: z.string().uuid(),
  scale: z.enum(['eight_point', 'four_point']),
  code: z.string(),
  points: z.number(),
  descriptor: z.string().nullable(),
  sortOrder: z.number(),
})

export type PerformanceLevel = z.infer<typeof performanceLevelSchema>

/* ------------------------------------------------------------------ *
 * Tasks
 * ------------------------------------------------------------------ */

export const taskSchema = z.object({
  name: z.string().trim().min(1, 'Name the assessment').max(160),
  category: z.enum(TASK_CATEGORIES),
  sessionId: z.string().uuid().optional().or(z.literal('')),
  learningAreaId: z.string().uuid().optional().or(z.literal('')),
  subjectId: z.string().uuid().optional().or(z.literal('')),
  maxScore: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((v) => v === '' || (!Number.isNaN(Number(v)) && Number(v) > 0), 'Enter a positive number'),
  weight: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine(
      (v) => v === '' || (!Number.isNaN(Number(v)) && Number(v) > 0 && Number(v) <= 100),
      'Enter a weight between 1 and 100',
    ),
})

export type TaskInput = z.input<typeof taskSchema>

/* ------------------------------------------------------------------ *
 * Marks entry
 * ------------------------------------------------------------------ */

/** One learner's result. Exactly one of level or score, decided by mode. */
export const markEntrySchema = z.object({
  studentId: z.string().uuid(),
  performanceLevelCode: z.string().max(4).optional().or(z.literal('')),
  score: z.string().trim().optional().or(z.literal('')),
  note: z.string().max(200).optional().or(z.literal('')),
})

/**
 * The batched save.
 *
 * Refined against the mode rather than trusting the client's choice: a basic
 * sheet submitted with a numeric score is refused here with a message a teacher
 * can act on, and refused again by the database.
 */
export const marksBatchSchema = z
  .object({
    taskId: z.string().uuid('Choose an assessment'),
    streamId: z.string().uuid('Choose a class'),
    entries: z.array(markEntrySchema).min(1, 'Enter at least one result'),
  })
  .superRefine((batch, ctx) => {
    for (const [index, entry] of batch.entries.entries()) {
      const hasLevel = Boolean(entry.performanceLevelCode)
      const hasScore = Boolean(entry.score)

      if (hasLevel && hasScore) {
        ctx.addIssue({
          code: 'custom',
          path: ['entries', index, 'score'],
          message: 'Enter a level or a score, not both',
        })
      }

      if (entry.score !== undefined && entry.score !== '') {
        const value = Number(entry.score)
        if (Number.isNaN(value) || value < 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['entries', index, 'score'],
            message: 'Enter a number of zero or more',
          })
        }
      }
    }
  })

export type MarksBatch = z.infer<typeof marksBatchSchema>

export interface GridRow {
  studentId: string
  studentNo: string
  fullName: string
  performanceLevelCode: string | null
  score: number | null
  note: string | null
  gradedAt: string | null
}

export interface MarkOutcome {
  studentId: string
  outcome: 'failed'
  message: string
}

export type MarksResult =
  | { ok: true; saved: number; skipped: number; outcomes: MarkOutcome[] }
  | { ok: false; error: string }

export type TaskResult = { ok: true } | { ok: false; error: string }

export type RubricResult = { ok: true } | { ok: false; error: string }

/* ------------------------------------------------------------------ *
 * Report cards
 * ------------------------------------------------------------------ */

export const issueReportCardsSchema = z.object({
  sessionId: z.string().uuid('Choose a term'),
  streamId: z.string().uuid('Choose a class'),
})

export type IssueReportCardsInput = z.infer<typeof issueReportCardsSchema>

export type IssueResult =
  | { ok: true; issued: number; studentIds: string[] }
  | { ok: false; error: string }

/**
 * Transcript aggregation.
 *
 * A raw percentage average across a learner's whole record is the easy answer
 * and the wrong one: a culminating assessment is not the same instrument as a
 * continuous score, so averaging them treats them as equivalent. A plain mean
 * is offered, and the row count is always shown so a reader can see how few
 * results it rests on. [A3] records that the weighting rules are unconfirmed.
 */
export function weightedAverage(
  rows: { score: number | null; maxScore: number | null; weight: number | null }[],
): number | null {
  const usable = rows.filter(
    (r): r is { score: number; maxScore: number | null; weight: number | null } =>
      r.score !== null && r.score !== undefined,
  )

  if (usable.length === 0) return null

  const total = usable.reduce((sum, r) => sum + (r.score / (r.maxScore || 100)) * 100, 0)
  return Math.round((total / usable.length) * 10) / 10
}

/** A grade band for a percentage. [A3] confirms the bands are unconfirmed. */
export function gradeBand(percentage: number): 'A' | 'B' | 'C' | 'D' | 'E' {
  if (percentage >= 80) return 'A'
  if (percentage >= 70) return 'B'
  if (percentage >= 60) return 'C'
  if (percentage >= 50) return 'D'
  return 'E'
}