import { z } from 'zod'
import { kenyanPhone } from '@/features/students/schema'

/**
 * Staff types and validation (CLAUDE.md section 7.12).
 *
 * TSC is the Teachers Service Commission and BOM the Board of Management, which
 * is why employer is a separate field from staff_type: a BOM-employed teacher is
 * a teaching staff member who is not on the TSC payroll, and collapsing the two
 * would lose that.
 */

export const STAFF_TYPES = ['teaching', 'non_teaching', 'admin', 'bom'] as const
export const EMPLOYERS = ['tsc', 'bom', 'private'] as const
export const STAFF_STATUSES = ['active', 'inactive', 'on_leave'] as const
export const GENDERS = ['male', 'female'] as const

export type StaffType = (typeof STAFF_TYPES)[number]
export type Employer = (typeof EMPLOYERS)[number]
export type StaffStatus = (typeof STAFF_STATUSES)[number]

export const STAFF_TYPE_LABELS: Record<StaffType, string> = {
  teaching: 'Teaching',
  non_teaching: 'Non-teaching',
  admin: 'Administration',
  bom: 'Board of Management',
}

export const EMPLOYER_LABELS: Record<Employer, string> = {
  tsc: 'TSC (Teachers Service Commission)',
  bom: 'BOM (Board of Management)',
  private: 'Privately employed',
}

export const STAFF_STATUS_LABELS: Record<StaffStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  on_leave: 'On leave',
}

/**
 * Optional email.
 *
 * The form always submits a string, so this needs no `.optional()`: a blank
 * field is an empty string, and the refine is what rejects a malformed address.
 */
const optionalEmail = () =>
  z
    .string()
    .trim()
    .max(160, 'Email is too long')
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address')

export const staffSchema = z.object({
  id: z.string().uuid().optional().or(z.literal('')),
  fullName: z.string().trim().min(1, 'Enter the full name').max(160),
  gender: z.enum(GENDERS).optional().or(z.literal('')),
  staffType: z.enum(STAFF_TYPES),
  employer: z.enum(EMPLOYERS),
  employmentType: z.string().trim().max(60).optional().or(z.literal('')),
  tscNumber: z.string().trim().max(40).optional().or(z.literal('')),
  phone: kenyanPhone.optional().or(z.literal('')),
  email: optionalEmail(),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  hiredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional()
    .or(z.literal('')),
  status: z.enum(STAFF_STATUSES),

  // National identifiers. Present in the payload for a permitted role and
  // simply ignored otherwise; the database decides who may store or read them,
  // so the client gating these is a convenience, not the control.
  kraPin: z.string().trim().max(20).optional().or(z.literal('')),
  nssfShaNumber: z.string().trim().max(40).optional().or(z.literal('')),
  nationalId: z.string().trim().max(40).optional().or(z.literal('')),
})

export type StaffInput = z.input<typeof staffSchema>
export type StaffValues = z.output<typeof staffSchema>

/** Directory search and filters. */
export const staffDirectorySchema = z.object({
  search: z.string().max(80).optional(),
  staffType: z.union([z.enum(STAFF_TYPES), z.literal('all')]).default('all'),
  employer: z.union([z.enum(EMPLOYERS), z.literal('all')]).default('all'),
  status: z.union([z.enum(STAFF_STATUSES), z.literal('all')]).default('all'),
})

export type StaffDirectory = z.infer<typeof staffDirectorySchema>

export const ASSIGNMENT_SCOPES = ['class_teacher', 'subject_teacher'] as const
export type AssignmentScope = (typeof ASSIGNMENT_SCOPES)[number]

export const ASSIGNMENT_SCOPE_LABELS: Record<AssignmentScope, string> = {
  class_teacher: 'Class teacher',
  subject_teacher: 'Subject teacher',
}

export const assignmentSchema = z
  .object({
    staffId: z.string().uuid('Choose a staff member'),
    academicYearId: z.string().uuid('Choose an academic year'),
    scope: z.enum(ASSIGNMENT_SCOPES),
    streamId: z.string().uuid().optional().or(z.literal('')),
    subjectId: z.string().uuid().optional().or(z.literal('')),
    learningAreaId: z.string().uuid().optional().or(z.literal('')),
  })
  // The database enforces these too. They are checked here as well so the
  // registrar gets a sentence instead of a database exception.
  .refine((v) => v.scope !== 'class_teacher' || v.streamId !== '', {
    message: 'A class teacher must be assigned to a specific stream',
    path: ['streamId'],
  })
  .refine(
    (v) => v.scope !== 'subject_teacher' || v.subjectId !== '' || v.learningAreaId !== '',
    {
      message: 'A subject teacher must be assigned to a subject or a learning area',
      path: ['subjectId'],
    },
  )

export type AssignmentInput = z.input<typeof assignmentSchema>

export type StaffActionResult = { ok: true; staffId: string } | { ok: false; error: string }
export type StaffFormResult = { ok: true } | { ok: false; error: string }