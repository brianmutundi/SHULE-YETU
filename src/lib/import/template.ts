import 'server-only'
import ExcelJS from 'exceljs'
import { getImportColumns, buildReferenceData, type ReferenceData } from './columns'
import type { OperatingMode, SchoolType } from '@/lib/school-type'

/**
 * Bulk import template writer.
 *
 * Produces the workbook a registrar downloads, fills in and uploads back. It
 * carries three sheets:
 *
 *   Students   the columns to fill in, with a worked example row
 *   Classes    the class labels this school has
 *   Streams    class + stream label pairs that actually exist
 *   Pathways   pathway codes (senior mode only)
 *
 * The reference sheets are the reason the template is generated rather than
 * shipped as a static file: the class list differs per school type, and streams
 * exist only for the academic year being imported into (section 4A).
 */

/** Options: this school, this year, this mode. */
export interface TemplateOptions {
  mode: OperatingMode
  schoolType: SchoolType
  schoolName: string
  streams: { classLabel: string; streamLabel: string }[]
  pathways: { code: string; name: string }[]
}

const HEADER_FILL = 'FFEDE9FE' // primary-soft
const REQUIRED_FILL = 'FFFEE2E2'

export async function buildImportTemplate(options: TemplateOptions): Promise<Buffer> {
  const columns = getImportColumns(options.mode)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = options.schoolName
  workbook.created = new Date()

  // --- Students sheet -------------------------------------------------------
  const sheet = workbook.addWorksheet('Students', {
    views: [{ state: 'frozen', ySplit: 2 }],
  })

  sheet.columns = columns.map((column) => ({
    header: column.required ? `${column.header} *` : column.header,
    key: column.key,
    width: Math.max(14, Math.min(32, column.header.length + 6)),
  }))

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.alignment = { vertical: 'middle' }

  columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1)
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: column.required ? REQUIRED_FILL : HEADER_FILL },
    }
  })

  sheet.addRow(exampleRow(options.mode))

  const example = sheet.getRow(2)
  example.font = { italic: true, color: { argb: 'FF6B7280' } }

  // Column hints live under the header so the registrar sees the accepted
  // format without opening a second file.
  columns.forEach((column, index) => {
    const cell = sheet.getCell(2, index + 1)
    cell.note = `${column.required ? 'Required. ' : 'Optional. '}${column.hint}`
  })

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  }

  // --- Reference sheets -----------------------------------------------------
  const reference: ReferenceData = buildReferenceData(options.mode, options.schoolType, {
    streams: options.streams,
    pathways: options.pathways,
  })

  addListSheet(workbook, 'Classes', ['Class'], reference.classes.map((label) => [label]))

  addListSheet(
    workbook,
    'Streams',
    ['Class', 'Stream'],
    reference.streams.map((s) => [s.classLabel, s.streamLabel]),
  )

  if (reference.pathways.length > 0) {
    addListSheet(
      workbook,
      'Pathways',
      ['Code', 'Name'],
      reference.pathways.map((p) => [p.code, p.name]),
    )
  }

  addListSheet(
    workbook,
    'How to fill this file',
    ['Field', 'Notes'],
    [
      ['Required fields', 'Marked with * in the Students sheet header. A row missing one is skipped and reported.'],
      ['Dates', 'YYYY-MM-DD, e.g. 2015-04-17. Excel may show the cell as a date; that is fine.'],
      ['Phones', 'Kenyan format, e.g. 0712345678 or +254712345678.'],
      ['Admission No', 'Leave blank and one is generated. Fill it in only when bringing in an existing register.'],
      ['Siblings', 'Give siblings the same Guardian Name and Guardian Phone and they share one guardian record.'],
      ['Media Consent', 'yes or no. Defaults to no. Separate from enrolment consent, which is always recorded.'],
      ['Limits', '5 MB and 5000 rows per file.'],
    ],
  )

  const output = await workbook.xlsx.writeBuffer()
  return Buffer.from(output)
}

function addListSheet(workbook: ExcelJS.Workbook, name: string, headers: string[], rows: string[][]) {
  const sheet = workbook.addWorksheet(name)
  sheet.columns = headers.map((header) => ({ header, key: header, width: 22 }))

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
  })

  for (const row of rows) sheet.addRow(row)

  if (rows.length === 0) {
    sheet.addRow([name === 'Pathways' ? 'No pathways configured yet' : 'None yet'])
  }
}

/**
 * One worked example row, mode-aware.
 *
 * Uses placeholder values rather than real reference data, so the example is
 * never mistaken for a record and never leaks a real learner's details.
 */
function exampleRow(mode: OperatingMode): Record<string, string> {
  const example: Record<string, string> = {
    studentNo: '',
    firstName: 'Amina',
    otherNames: 'Wanjiru',
    surname: 'Kamau',
    gender: 'female',
    dateOfBirth: '2015-04-17',
    upi: '',
    birthCertNo: 'C1234567',
    nationality: 'Kenyan',
    county: 'Nairobi',
    subCounty: 'Westlands',
    address: 'P.O. Box 12345',
    phone: '0712345678',
    email: '',
    classLabel: mode === 'senior' ? 'Grade 10' : 'Grade 3',
    streamLabel: 'A',
    status: 'active',
    previousSchool: '',
    guardianName: 'Peter Kamau',
    guardianPhone: '0723456789',
    guardianNationalId: '22345678',
    guardianRelationship: 'parent',
    guardianOccupation: 'Teacher',
    guardianEmail: '',
    bloodGroup: 'O+',
    allergies: '',
    conditions: '',
    transportMode: 'School bus',
    transportRoute: 'Route 4',
  }

  if (mode === 'senior') {
    Object.assign(example, {
      pathwayCode: 'STEM',
      track: '',
      assessmentNumber: 'KNEC12345',
      house: 'Rufaro',
      boardingStatus: 'day',
      mediaConsent: 'no',
    })
  }

  return example
}