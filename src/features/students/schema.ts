import { z } from 'zod'

/** Kenyan mobile numbers, normalized to E.164. */
export const kenyanPhone = z
  .string()
  .trim()
  .regex(/^(?:\+?254|0)(?:7|1)\d{8}$/, 'Enter a valid Kenyan phone number, e.g. 0712345678')
  .transform((value) => `+${value.replace(/[^\d]/g, '').replace(/^0/, '254')}`)

export const studentStatusSchema = z.enum([
  'draft',
  'active',
  'inactive',
  'completed',
  'graduated',
  'transferred',
  'withdrawn',
])

export const studentGenderSchema = z.enum(['male', 'female'])

/**
 * Quick-create fields for Phase 3.
 *
 * The full six-step wizard arrives in Phase 5; this is the minimum a
 * directory needs so a registrar can add a learner and fill the rest later
 * (section 7.6, quick registration).
 */
export const quickCreateStudentSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter the first name').max(80),
  otherNames: z.string().trim().max(120).optional().or(z.literal('')),
  surname: z.string().trim().max(80).optional().or(z.literal('')),
  gender: studentGenderSchema,
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date of birth'),
  status: studentStatusSchema.default('active'),
  streamId: z.string().uuid().optional().or(z.literal('')),
  phone: kenyanPhone.optional().or(z.literal('')),
  upi: z.string().trim().max(24).optional().or(z.literal('')),
  county: z.string().trim().max(80).optional().or(z.literal('')),
  subCounty: z.string().trim().max(80).optional().or(z.literal('')),
})

export type QuickCreateInput = z.input<typeof quickCreateStudentSchema>
export type QuickCreateValues = z.output<typeof quickCreateStudentSchema>

export const directorySearchSchema = z.object({
  search: z.string().max(80).optional(),
  status: z.union([studentStatusSchema, z.literal('all')]).default('all'),
  gender: z.union([studentGenderSchema, z.literal('all')]).default('all'),
  streamId: z.string().optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
})

export type DirectorySearch = z.infer<typeof directorySearchSchema>