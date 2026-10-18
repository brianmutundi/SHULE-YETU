import { z } from 'zod'
import { kenyanPhone } from '../students/schema'

/**
 * Enrolment payload.
 *
 * Discriminated on operatingMode (CLAUDE.md section 9): basic mode carries
 * admission fields, senior mode carries placement fields. Shared fields are
 * hoisted into the common shape rather than duplicated, so a field added once
 * cannot drift between the two branches.
 */

const studentBase = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  otherNames: z.string().trim().max(120).optional().or(z.literal('')),
  surname: z.string().trim().max(80).optional().or(z.literal('')),
  gender: z.enum(['male', 'female']),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth is required'),
  nationality: z.string().trim().max(80).optional().or(z.literal('')),
  county: z.string().trim().min(1, 'County is required').max(80),
  subCounty: z.string().trim().min(1, 'Sub-county is required').max(80),
  upi: z.string().trim().max(24).optional().or(z.literal('')),
  birthCertNo: z.string().trim().max(40).optional().or(z.literal('')),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  phone: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || /^(?:\+?254|0)(?:7|1)\d{8}$/.test(v), 'Enter a valid Kenyan phone number'),
  email: z.string().trim().max(160).optional().or(z.literal('')),
  tuitionWaiver: z.boolean().default(false),
  orphanStatus: z.enum(['none', 'one_parent_deceased', 'both_deceased', 'unknown']).default('none'),
})

const guardianSchema = z.object({
  fullName: z.string().trim().min(1, 'Guardian name is required').max(160),
  nationalId: z.string().trim().max(40).optional().or(z.literal('')),
  phone: kenyanPhone,
  email: z.string().trim().max(160).optional().or(z.literal('')),
  occupation: z.string().trim().max(80).optional().or(z.literal('')),
  relationship: z
    .enum(['parent', 'grandparent', 'sibling', 'aunt_uncle', 'relative', 'guardian', 'other'])
    .default('parent'),
  isPrimary: z.boolean().default(false),
  isEmergencyContact: z.boolean().default(false),
  isFeePayer: z.boolean().default(false),
  isDeceased: z.boolean().default(false),
  absenceReason: z.string().trim().max(160).optional().or(z.literal('')),
})

const healthSchema = z.object({
  bloodGroup: z.string().trim().max(10).optional().or(z.literal('')),
  allergies: z.string().trim().max(300).optional().or(z.literal('')),
  conditions: z.string().trim().max(300).optional().or(z.literal('')),
  emergencyContact: z.string().trim().max(160).optional().or(z.literal('')),
  strengths: z.string().trim().max(300).optional().or(z.literal('')),
  challenges: z.string().trim().max(300).optional().or(z.literal('')),
  specialNeedsCategory: z.string().trim().max(80).optional().or(z.literal('')),
  specialNeedsNotes: z.string().trim().max(300).optional().or(z.literal('')),
})

const logisticsSchema = z.object({
  transportMode: z.string().trim().max(60).optional().or(z.literal('')),
  transportRoute: z.string().trim().max(120).optional().or(z.literal('')),
  boardingStatus: z.enum(['day', 'boarding']).optional(),
  house: z.string().trim().max(60).optional().or(z.literal('')),
})

const consentsSchema = z.object({
  enrolment: z.literal(true, { message: 'Enrolment consent is required' }),
  dataPrivacy: z.boolean().default(false),
  media: z.boolean().default(false),
  enrolmentBasis: z.string().trim().max(80).default('consent'),
})

const shared = {
  student: studentBase,
  guardians: z.array(guardianSchema).min(1, 'Add at least one guardian'),
  health: healthSchema,
  logistics: logisticsSchema,
  consents: consentsSchema,
}

export const enrolmentSchema = z.discriminatedUnion('operatingMode', [
  // Basic mode: admission fields, no pathway, no subjects.
  z.object({
    operatingMode: z.literal('basic'),
    ...shared,
    admission: z.object({
      admittedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Admission date is required'),
      academicYearId: z.string().uuid(),
      streamId: z.string().uuid().optional().or(z.literal('')),
      previousSchool: z.string().trim().max(160).optional().or(z.literal('')),
      transferReason: z.string().trim().max(200).optional().or(z.literal('')),
    }),
  }),

  // Senior mode: placement fields replace admission.
  z.object({
    operatingMode: z.literal('senior'),
    ...shared,
    placement: z.object({
      admittedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Admission date is required'),
      academicYearId: z.string().uuid(),
      streamId: z.string().uuid().optional().or(z.literal('')),
      previousSchool: z.string().trim().max(160).optional().or(z.literal('')),
      transferReason: z.string().trim().max(200).optional().or(z.literal('')),
      pathwayCode: z.string().trim().min(1, 'Select a pathway'),
      track: z.string().trim().max(60).optional().or(z.literal('')),
      assessmentNumber: z.string().trim().max(40).optional().or(z.literal('')),
      subjectIds: z.array(z.string().uuid()).default([]),
    }),
  }),
])

export type EnrolmentInput = z.input<typeof enrolmentSchema>
export type EnrolmentValues = z.output<typeof enrolmentSchema>