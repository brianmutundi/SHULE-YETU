import { getClassesForSchoolType, hasPathways, type OperatingMode, type SchoolType } from '@/lib/school-type'

/**
 * Bulk import template definition.
 *
 * The template is mode-aware (CLAUDE.md section 7.8): a senior school's file
 * carries pathway and assessment columns, a basic school's does not. A column
 * for another mode never appears in the file, the reference sheet or a
 * validation message, so a registrar cannot be told to fill in a field this
 * school has no concept of.
 *
 * The column list is the contract between three things that must not drift:
 * the generated file, the parser, and the Zod schema. All three read it.
 */

export interface ImportColumn {
  /** Key in the normalized row payload. */
  key: string
  /** Header text written into the spreadsheet. */
  header: string
  required: boolean
  /** Shown in the reference sheet as the accepted format. */
  hint: string
  /** Senior-mode columns are omitted entirely in basic mode. */
  seniorOnly?: boolean
}

const SHARED_COLUMNS: readonly ImportColumn[] = [
  { key: 'studentNo', header: 'Admission No', required: false, hint: 'Leave blank to generate one automatically' },
  { key: 'firstName', header: 'First Name', required: true, hint: 'Text' },
  { key: 'otherNames', header: 'Other Names', required: false, hint: 'Text' },
  { key: 'surname', header: 'Surname', required: false, hint: 'Text' },
  { key: 'gender', header: 'Gender', required: true, hint: 'male or female' },
  { key: 'dateOfBirth', header: 'Date of Birth', required: true, hint: 'YYYY-MM-DD' },
  { key: 'upi', header: 'UPI', required: false, hint: 'Leave blank if not issued' },
  { key: 'birthCertNo', header: 'Birth Cert No', required: false, hint: 'Text' },
  { key: 'nationality', header: 'Nationality', required: false, hint: 'Text' },
  { key: 'county', header: 'County', required: false, hint: 'Text' },
  { key: 'subCounty', header: 'Sub County', required: false, hint: 'Text' },
  { key: 'address', header: 'Address', required: false, hint: 'Text' },
  { key: 'phone', header: 'Phone', required: false, hint: 'Learner phone, e.g. 0712345678' },
  { key: 'email', header: 'Email', required: false, hint: 'Text' },
  { key: 'classLabel', header: 'Class', required: true, hint: 'See the Classes reference sheet' },
  { key: 'streamLabel', header: 'Stream', required: false, hint: 'See the Streams reference sheet' },
  { key: 'status', header: 'Status', required: false, hint: 'active, inactive or draft. Defaults to active' },
  { key: 'previousSchool', header: 'Previous School', required: false, hint: 'Text' },
  { key: 'guardianName', header: 'Guardian Name', required: true, hint: 'Text' },
  { key: 'guardianPhone', header: 'Guardian Phone', required: true, hint: 'e.g. 0712345678. Used to match siblings' },
  { key: 'guardianNationalId', header: 'Guardian National ID', required: false, hint: 'Text' },
  { key: 'guardianRelationship', header: 'Guardian Relationship', required: false, hint: 'parent, grandparent, sibling, aunt_uncle, relative, guardian, other' },
  { key: 'guardianOccupation', header: 'Guardian Occupation', required: false, hint: 'Text' },
  { key: 'guardianEmail', header: 'Guardian Email', required: false, hint: 'Text' },
  { key: 'bloodGroup', header: 'Blood Group', required: false, hint: 'Text' },
  { key: 'allergies', header: 'Allergies', required: false, hint: 'Text' },
  { key: 'conditions', header: 'Conditions', required: false, hint: 'Text' },
  { key: 'transportMode', header: 'Transport Mode', required: false, hint: 'Text' },
  { key: 'transportRoute', header: 'Transport Route', required: false, hint: 'Text' },
]

const SENIOR_COLUMNS: readonly ImportColumn[] = [
  { key: 'pathwayCode', header: 'Pathway Code', required: true, hint: 'See the Pathways reference sheet', seniorOnly: true },
  { key: 'track', header: 'Track', required: false, hint: 'Text', seniorOnly: true },
  { key: 'assessmentNumber', header: 'KNEC Assessment No', required: false, hint: 'Text', seniorOnly: true },
  { key: 'house', header: 'House', required: false, hint: 'Text. Senior schools only', seniorOnly: true },
  { key: 'boardingStatus', header: 'Boarding Status', required: false, hint: 'day or boarding', seniorOnly: true },
  { key: 'mediaConsent', header: 'Media Consent', required: false, hint: 'yes or no. Defaults to no', seniorOnly: true },
]

/** Columns for this operating mode, in template order. */
export function getImportColumns(mode: OperatingMode): ImportColumn[] {
  const shared = [...SHARED_COLUMNS]
  return hasPathways(mode) ? [...shared, ...SENIOR_COLUMNS] : shared
}

/** Header row for this operating mode. */
export function getImportHeaders(mode: OperatingMode): string[] {
  return getImportColumns(mode).map((column) => column.header)
}

/**
 * Header-to-payload-key lookup.
 *
 * Matching is on a normalized header so `Date of Birth`, `date_of_birth` and
 * `Date of Birth ` all land on the same field. Registrars edit these files by
 * hand and retyping a header is the most common thing they do.
 */
export function buildHeaderMap(mode: OperatingMode): Map<string, ImportColumn> {
  const map = new Map<string, ImportColumn>()
  for (const column of getImportColumns(mode)) {
    map.set(normalizeHeader(column.header), column)
  }
  return map
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
}

/**
 * Reference sheet rows.
 *
 * Only values this school actually has. The class list comes from the school
 * type definition so a `primary` tenant is never offered Grade 10 (section 4A).
 */
export interface ReferenceData {
  classes: string[]
  streams: { classLabel: string; streamLabel: string }[]
  pathways: { code: string; name: string }[]
}

export function buildReferenceData(
  mode: OperatingMode,
  schoolType: SchoolType,
  live: { streams: { classLabel: string; streamLabel: string }[]; pathways: { code: string; name: string }[] },
): ReferenceData {
  return {
    classes: [...getClassesForSchoolType(schoolType)],
    streams: live.streams,
    pathways: hasPathways(mode) ? live.pathways : [],
  }
}

/** Upload limits from CLAUDE.md section 7.8. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const MAX_IMPORT_ROWS = 5000
/** Rows written per transaction. A failure costs one chunk, not the file. */
export const IMPORT_CHUNK_SIZE = 200

export const ACCEPTED_UPLOAD_EXTENSIONS = ['.xlsx', '.csv'] as const