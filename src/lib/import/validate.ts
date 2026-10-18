import { z } from 'zod'
import { getImportColumns } from './columns'
import { hasPathways, type OperatingMode } from '@/lib/school-type'

/**
 * Row validation.
 *
 * Runs on the server over the parsed file, twice in effect: once to produce the
 * preview a registrar confirms, and again inside the write path, because the
 * batch's rows are re-checked against live data at insert time (see
 * app.import_students).
 *
 * Rows are validated independently so one bad row cannot fail the file. The
 * registrar gets a per-row message naming the field, which is the difference
 * between a fixable upload and a support ticket.
 */

export interface RowIssue {
  /** Payload key, or null for a row-level problem. */
  field: string | null
  /** Human label for the column, so the message matches the template. */
  column: string | null
  message: string
}

export interface ValidatedRow {
  rowNumber: number
  values: Record<string, string>
  issues: RowIssue[]
}

/** Fields every row must carry. */
const requiredText = (label: string, max = 160) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`)

/**
 * Optional free text.
 *
 * Blank passes and blank is preserved. Every declared column arrives as a
 * string (validateRow materialises the missing ones), so this needs no
 * `.optional()`: an absent spreadsheet cell is an empty cell, not an absent
 * value.
 */
const optionalText = (max: number, label?: string) =>
  z.string().trim().max(max, label ? `${label} is too long` : `Must be ${max} characters or fewer`)

/** Kenyan mobile, normalized to E.164 exactly as the wizard does. */
const phone = (label: string) =>
  z
    .string()
    .trim()
    .regex(KENYAN_PHONE, `${label}: enter a Kenyan number, e.g. 0712345678`)
    .transform(toE164)

/** Optional email: blank passes, a malformed address does not. */
const optionalEmail = (label: string) =>
  z
    .string()
    .trim()
    .max(160, `${label} is too long`)
    .refine(
      (value) => value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      `${label} is not valid`,
    )

/** Kenyan mobile -> E.164. Shared by the required and optional variants. */
const toE164 = (value: string) => `+${value.replace(/[^\d]/g, '').replace(/^0/, '254')}`

const KENYAN_PHONE = /^(?:\+?254|0)(?:7|1)\d{8}$/

/** Optional Kenyan phone: blank passes, a wrong number does not. */
const optionalPhone = (label: string) =>
  z
    .string()
    .trim()
    .refine(
      (value) => value === '' || KENYAN_PHONE.test(value),
      `${label}: enter a Kenyan number, e.g. 0712345678`,
    )
    .transform((value) => (value === '' ? '' : toE164(value)))

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'use the format YYYY-MM-DD')
  // Date.parse rolls impossible dates over rather than rejecting them:
  // 2015-02-30 becomes 2 March silently, which would write the wrong birthday
  // into a register. The parts are compared instead.
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    )
  }, 'that is not a real date')

/**
 * Common fields, present in every mode.
 *
 * Kept as a flat shape because a spreadsheet row has no nested structure, so
 * there is nothing for a discriminated union to discriminate on. The mode
 * differences that matter are handled below: senior-only fields are required
 * only when the school is a senior school.
 */
const sharedShape = {
  studentNo: optionalText(24, 'Admission number'),
  firstName: requiredText('First Name', 80),
  otherNames: optionalText(120),
  surname: optionalText(80),
  gender: z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .pipe(z.enum(['male', 'female'], { message: 'Gender must be male or female' })),
  dateOfBirth: isoDate,
  upi: optionalText(24, 'UPI'),
  birthCertNo: optionalText(40),
  nationality: optionalText(80),
  county: optionalText(80),
  subCounty: optionalText(80),
  address: optionalText(200),
  phone: optionalPhone('Phone'),
  email: optionalEmail('Email'),
  classLabel: requiredText('Class', 80),
  streamLabel: optionalText(40),
  // Blank takes the default; anything else must be one of the three values.
  // Written as transform-then-enum rather than enum-or-branch so the blank
  // case is decided before the enum sees it.
  status: z
    .string()
    .trim()
    .transform((value) => (value === '' ? 'active' : value.toLowerCase()))
    .pipe(z.enum(['active', 'inactive', 'draft'], { message: 'Status must be active, inactive or draft' })),
  previousSchool: optionalText(160),
  guardianName: requiredText('Guardian Name'),
  guardianPhone: phone('Guardian Phone'),
  guardianNationalId: optionalText(40),
  guardianRelationship: z
    .string()
    .trim()
    .transform((value) => (value === '' ? 'parent' : value.toLowerCase()))
    .pipe(
      z.enum([
        'parent',
        'grandparent',
        'sibling',
        'aunt_uncle',
        'relative',
        'guardian',
        'other',
      ]),
    ),
  guardianOccupation: optionalText(80),
  guardianEmail: optionalEmail('Guardian email'),
  bloodGroup: optionalText(10),
  allergies: optionalText(300),
  conditions: optionalText(300),
  transportMode: optionalText(60),
  transportRoute: optionalText(120),
}

const seniorShape = {
  pathwayCode: requiredText('Pathway Code', 40),
  track: optionalText(60),
  assessmentNumber: optionalText(40),
  house: optionalText(60),
  boardingStatus: z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .refine((value) => value === '' || value === 'day' || value === 'boarding', {
      message: 'Boarding status must be day or boarding',
    }),
  mediaConsent: z
    .string()
    .trim()
    .transform((value) => (value === '' ? 'no' : value.toLowerCase()))
    .pipe(z.enum(['yes', 'no'], { message: 'Media consent must be yes or no' })),
}

/**
 * Row schema for this operating mode.
 *
 * A basic tenant's row schema has no pathway field at all, so a spreadsheet
 * carrying one cannot be validated as a basic-mode row by accident: the column
 * is not in the contract, so it lands in unknownColumns instead (section 4A).
 */
export function getRowSchema(mode: OperatingMode) {
  return hasPathways(mode)
    ? z.object({ ...sharedShape, ...seniorShape })
    : z.object(sharedShape)
}

/**
 * Validate one parsed row.
 *
 * Returns the coerced values alongside the issues rather than throwing, so a
 * caller can stage a row that is merely imperfect and report all of them at
 * once instead of one per upload.
 */
export function validateRow(
  row: { rowNumber: number; values: Record<string, string> },
  mode: OperatingMode,
): ValidatedRow {
  const schema = getRowSchema(mode)

  // A spreadsheet row only carries the columns the cell actually had. An
  // untouched optional column arrives as absent, not as '', so every declared
  // column is materialised as a string first. Without this, an omitted optional
  // column reads as `undefined` and fails as "expected string, received
  // undefined" rather than as the blank it is.
  const input: Record<string, string> = {}
  for (const column of getImportColumns(mode)) {
    input[column.key] = row.values[column.key] ?? ''
  }

  const parsed = schema.safeParse(input)

  if (parsed.success) {
    const coerced = stringifyBooleans(parsed.data as Record<string, unknown>)

    // Coerced values must win over the raw cells. Spreading the raw row first
    // and the coerced values second is load-bearing: with the order reversed,
    // the untransformed phone in the row would overwrite the normalized one and
    // every guardian phone would be stored as typed.
    return {
      rowNumber: row.rowNumber,
      values: { ...row.values, ...coerced },
      issues: [],
    }
  }

  // Map each issue onto the template header so the message names the column the
  // registrar actually sees.
  const byKey = new Map(getImportColumns(mode).map((column) => [column.key, column.header]))

  const issues: RowIssue[] = parsed.error.issues.map((issue) => {
    const key = issue.path[0]
    const keyString = typeof key === 'string' ? key : ''

    return {
      field: keyString || null,
      column: byKey.get(keyString) ?? null,
      message: issue.message,
    }
  })

  return { rowNumber: row.rowNumber, values: row.values, issues }
}

/**
 * Duplicate detection within the file.
 *
 * CLAUDE.md section 7.8 names three signals: same admission number, same UPI,
 * or same name + date of birth + guardian phone. The first two are exact; the
 * third is the sibling signal and must NOT fire for genuine siblings, which
 * share a guardian but differ in name or date of birth.
 *
 * Duplicates are reported, not silently dropped. A registrar importing a
 * 400-learner register wants to see that two rows collapsed into one before
 * it happens, not after.
 */
export function findDuplicates(rows: ValidatedRow[]): Map<number, RowIssue[]> {
  const duplicates = new Map<number, RowIssue[]>()

  const add = (rowNumber: number, issue: RowIssue) => {
    const existing = duplicates.get(rowNumber)
    if (existing) existing.push(issue)
    else duplicates.set(rowNumber, [issue])
  }

  const seenNo = new Map<string, number>()
  const seenUpi = new Map<string, number>()
  const seenIdentity = new Map<string, number>()

  for (const row of rows) {
    const values = row.values

    const studentNo = values.studentNo?.trim()
    if (studentNo) {
      const key = studentNo.toLowerCase()
      const first = seenNo.get(key)
      if (first !== undefined) {
        add(row.rowNumber, {
          field: 'studentNo',
          column: 'Admission No',
          message: `Same admission number as row ${first}`,
        })
      } else {
        seenNo.set(key, row.rowNumber)
      }
    }

    const upi = values.upi?.trim()
    if (upi) {
      const key = upi.toLowerCase()
      const first = seenUpi.get(key)
      if (first !== undefined) {
        add(row.rowNumber, {
          field: 'upi',
          column: 'UPI',
          message: `Same UPI as row ${first}`,
        })
      } else {
        seenUpi.set(key, row.rowNumber)
      }
    }

    // Sibling-safe: name and date of birth must both match.
    const firstName = values.firstName?.trim().toLowerCase()
    const dob = values.dateOfBirth?.trim()
    const guardianPhone = values.guardianPhone?.trim()

    if (firstName && dob && guardianPhone) {
      const key = `${firstName}|${dob}|${guardianPhone}`
      const first = seenIdentity.get(key)
      if (first !== undefined) {
        add(row.rowNumber, {
          field: null,
          column: null,
          message: `Same name, date of birth and guardian phone as row ${first}`,
        })
      } else {
        seenIdentity.set(key, row.rowNumber)
      }
    }
  }

  return duplicates
}

/**
 * Coerce the yes/no fields into booleans for the SQL payload.
 *
 * `mediaConsent` is the only one that reaches a boolean column; it is kept out
 * of the shared shape so a basic-mode row cannot carry it at all.
 */
function stringifyBooleans(values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}

  for (const [key, value] of Object.entries(values)) {
    if (key === 'mediaConsent') {
      out[key] = value === 'yes' ? 'true' : 'false'
      continue
    }

    if (typeof value === 'boolean') {
      out[key] = value ? 'true' : 'false'
      continue
    }

    out[key] = value === null || value === undefined ? '' : String(value)
  }

  return out
}

export type ValidatedRowValues = z.output<ReturnType<typeof getRowSchema>>