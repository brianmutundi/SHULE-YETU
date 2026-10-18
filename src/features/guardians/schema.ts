import { z } from 'zod'
import { kenyanPhone } from '../students/schema'

export const guardianRelationshipSchema = z.enum([
  'parent',
  'grandparent',
  'sibling',
  'aunt_uncle',
  'relative',
  'guardian',
  'other',
])

export const createGuardianSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter the guardian name').max(160),
  phone: kenyanPhone,
  email: z.string().trim().max(160).optional().or(z.literal('')),
  nationalId: z.string().trim().max(40).optional().or(z.literal('')),
  occupation: z.string().trim().max(80).optional().or(z.literal('')),
  relationship: guardianRelationshipSchema.default('parent'),
  isDeceased: z.boolean().default(false),
  absenceReason: z.string().trim().max(160).optional().or(z.literal('')),
})

export type CreateGuardianInput = z.input<typeof createGuardianSchema>
export type CreateGuardianValues = z.output<typeof createGuardianSchema>

export const linkStudentSchema = z.object({
  guardianId: z.string().uuid('Select a guardian'),
  studentNo: z.string().trim().min(1, 'Enter the admission number'),
  relationship: guardianRelationshipSchema.default('parent'),
  isPrimary: z.boolean().default(false),
  isEmergencyContact: z.boolean().default(false),
  isFeePayer: z.boolean().default(false),
})

export type LinkStudentInput = z.input<typeof linkStudentSchema>

export const unlinkStudentSchema = z.object({
  guardianId: z.string().uuid(),
  studentId: z.string().uuid(),
})

/**
 * Add a guardian to a learner from the Full Student Record's Family tab.
 *
 * Same fields as createGuardianSchema plus the link flags, since the dialog
 * collects both at once.
 */
export const addStudentGuardianSchema = createGuardianSchema.extend({
  studentId: z.string().uuid(),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  isPrimary: z.boolean().default(false),
  isEmergencyContact: z.boolean().default(false),
  isFeePayer: z.boolean().default(false),
})

export type AddStudentGuardianInput = z.input<typeof addStudentGuardianSchema>

/** Edit the fields the guardians table shows. Links are changed separately. */
export const updateGuardianSchema = z.object({
  guardianId: z.string().uuid(),
  fullName: z.string().trim().min(1, 'Enter the guardian name').max(160),
  phone: kenyanPhone,
  address: z.string().trim().max(200).optional().or(z.literal('')),
})

export type UpdateGuardianInput = z.input<typeof updateGuardianSchema>
