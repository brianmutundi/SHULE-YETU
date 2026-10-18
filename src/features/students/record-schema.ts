import { z } from 'zod'
import { KENYA_COUNTIES } from '@/lib/kenya-counties'

/**
 * Schemas for editing an existing learner from the Full Student Record
 * (section 7.7). The enrolment wizard owns creation; these cover the edits a
 * registrar makes afterwards.
 */

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''))

const phone = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .refine((v) => !v || /^(?:\+?254|0)(?:7|1)\d{8}$/.test(v), 'Enter a valid Kenyan phone number')

export const bioSchema = z.object({
  studentId: z.string().uuid(),
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  otherNames: optionalText(120),
  surname: optionalText(80),
  gender: z.enum(['male', 'female']),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth is required')
    // A learner cannot be born in the future, which a plain regex accepts.
    .refine((v) => new Date(v) <= new Date(), 'Date of birth cannot be in the future'),
  status: z.enum(['active', 'inactive', 'graduated', 'completed', 'transferred', 'withdrawn']),
  nationality: optionalText(80),
  county: z.enum(KENYA_COUNTIES, { message: 'Select a county' }),
  subCounty: z.string().trim().min(1, 'Sub-county is required').max(80),
  upi: optionalText(24),
  birthCertNo: optionalText(40),
  address: optionalText(200),
  phone,
  email: z.string().trim().max(160).optional().or(z.literal('')),
  orphanStatus: z.enum(['none', 'one_parent_deceased', 'both_deceased', 'unknown']),
  // An unchecked checkbox is absent from FormData entirely, so this accepts
  // either a real boolean (programmatic) or the checkbox's "true" string.
  tuitionWaiver: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
    .default(false),
  streamId: z.string().uuid().optional().or(z.literal('')),
  previousSchool: optionalText(160),
  transferReason: optionalText(200),
})

export const medicalSchema = z.object({
  studentId: z.string().uuid(),
  bloodGroup: optionalText(10),
  allergies: optionalText(300),
  conditions: optionalText(300),
  emergencyContact: optionalText(160),
  strengths: optionalText(300),
  challenges: optionalText(300),
  specialNeedsCategory: optionalText(80),
  specialNeedsNotes: optionalText(300),
})

export const logisticsSchema = z.object({
  studentId: z.string().uuid(),
  transportMode: optionalText(60),
  transportRoute: optionalText(120),
  boardingStatus: z.enum(['day', 'boarding']).optional(),
  house: optionalText(60),
})

export const consentSchema = z.object({
  studentId: z.string().uuid(),
  consentKind: z.enum(['guardian_enrollment', 'data_privacy', 'media']),
  granted: z.boolean(),
  lawfulBasis: z.string().trim().min(1, 'A lawful basis is required').max(80).default('consent'),
})

export type BioInput = z.input<typeof bioSchema>
export type MedicalInput = z.input<typeof medicalSchema>
export type LogisticsInput = z.input<typeof logisticsSchema>
export type ConsentInput = z.input<typeof consentSchema>