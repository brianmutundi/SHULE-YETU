import { z } from 'zod'
import { SCHOOL_TYPES } from '@/lib/school-type'

/** Kenyan mobile numbers: 07XXXXXXXX or 01XXXXXXXX, stored as E.164. */
const kenyanPhone = z
  .string()
  .trim()
  .regex(/^(?:\+?254|0)(?:7|1)\d{8}$/, 'Enter a valid Kenyan phone number, e.g. 0712345678')
  .transform((value) => {
    const digits = value.replace(/[^\d]/g, '').replace(/^0/, '254')
    return `+${digits}`
  })

const registrationBase = z.object({
  schoolName: z.string().trim().min(2, 'Enter the school name').max(120),
  ownership: z.enum(['public', 'private']),
  boardingMode: z.enum(['day', 'boarding', 'mixed']),
  gender: z.enum(['boys', 'girls', 'mixed']),
  county: z.string().trim().min(2, 'Enter the county').max(80),
  subCounty: z.string().trim().min(2, 'Enter the sub-county').max(80),
  schoolCode: z.string().trim().max(40).optional().or(z.literal('')),
  knecCenterCode: z.string().trim().max(40).optional().or(z.literal('')),
  sponsor: z.string().trim().max(80).optional().or(z.literal('')),
  adminName: z.string().trim().min(2, 'Enter your full name').max(120),
  adminEmail: z.email('Enter a valid email address'),
  adminPhone: kenyanPhone,
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
})

/**
 * School type drives onboarding. The union keeps the discriminator explicit so
 * a senior school can never submit primary-only fields, and vice versa.
 */
export const registrationSchema = z.discriminatedUnion('schoolType', [
  registrationBase.extend({
    schoolType: z.enum(['primary', 'junior', 'primary_junior']),
    // Government capitation is only meaningful for public schools.
    capitationEnabled: z.boolean().default(false),
  }),
  registrationBase.extend({
    schoolType: z.literal('senior'),
    capitationEnabled: z.literal(false),
  }),
])

export type RegistrationInput = z.input<typeof registrationSchema>
export type RegistrationValues = z.output<typeof registrationSchema>

export const schoolTypeEnum = z.enum(SCHOOL_TYPES)

export const signInSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

export type SignInInput = z.input<typeof signInSchema>