import { describe, expect, it } from 'vitest'
import { validateRow } from '@/lib/import/validate'
import { getImportHeaders } from '@/lib/import/columns'

/**
 * End-to-end shape of the import path: file bytes -> parsed rows -> validated
 * rows.
 *
 * parseUpload is server-only, so it runs through a dynamic import here. The
 * assertion that matters is that a header row matching the real template
 * produces values keyed exactly as the validator expects.
 */

async function uploadCsv(name: string, csv: string, mode: 'basic' | 'senior' = 'basic') {
  const { parseUpload: parse } = await import('@/lib/import/parse')
  return parse(Buffer.from(csv, 'utf8'), name, mode)
}

/**
 * A CSV whose header row is the real template header for this mode.
 *
 * Rows are given as objects keyed by header text, not as arrays, so a test
 * cannot silently drift out of alignment when the column order changes: a
 * missing key becomes an empty cell in the right place rather than shifting
 * every value after it.
 */
function csvWithTemplateHeader(
  rows: Record<string, string>[],
  mode: 'basic' | 'senior' = 'basic',
): string {
  const headers = getImportHeaders(mode)

  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => row[header] ?? '').join(',')),
  ]

  return lines.join('\n')
}

/** A valid basic-mode learner, as header-keyed values. */
function learner(over: Record<string, string> = {}): Record<string, string> {
  return {
    'First Name': 'Amina',
    'Other Names': 'Wanjiru',
    Surname: 'Kamau',
    Gender: 'female',
    'Date of Birth': '2015-04-17',
    Class: 'Grade 3',
    Stream: 'A',
    'Guardian Name': 'Peter Kamau',
    'Guardian Phone': '0723456789',
    ...over,
  }
}

describe('upload parsing end to end', () => {
  it('reads a basic-mode CSV into keyed rows', async () => {
    const result = await uploadCsv('learners.csv', csvWithTemplateHeader([learner()]))

    expect(result.fatal).toBeUndefined()
    expect(result.rows).toHaveLength(1)

    const values = validateRow(result.rows[0], 'basic')
    expect(values.issues).toEqual([])
    expect(values.values.firstName).toBe('Amina')
    expect(values.values.classLabel).toBe('Grade 3')
    // Phone arrives from the spreadsheet local-format and is normalized.
    expect(values.values.guardianPhone).toBe('+254723456789')
  })

  it('numbers rows from the file, not from the parsed count', async () => {
    const result = await uploadCsv(
      'learners.csv',
      csvWithTemplateHeader([
        learner(),
        learner({ 'First Name': 'Brian', Surname: 'Otieno', Gender: 'male', 'Date of Birth': '2014-02-01', 'Guardian Name': 'Mary' }),
      ]),
    )

    expect(result.rows.map((r) => r.rowNumber)).toEqual([2, 3])
  })

  it('skips blank rows', async () => {
    const result = await uploadCsv(
      'learners.csv',
      csvWithTemplateHeader([learner(), {}]),
    )

    expect(result.rows).toHaveLength(1)
  })

  it('reports a missing required column rather than importing a broken file', async () => {
    const result = await uploadCsv('learners.csv', 'First Name,Gender\nAmina,female')

    expect(result.missingColumns).toContain('Date of Birth')
    expect(result.missingColumns).toContain('Guardian Phone')
  })

  it('reports an unknown column instead of silently dropping the data', async () => {
    const headers = getImportHeaders('basic')
    const result = await uploadCsv('learners.csv', [...headers, 'Favourite Colour'].join(',') + '\n')

    expect(result.unknownColumns).toEqual(['Favourite Colour'])
  })

  it('tolerates the asterisk the template puts on required headers', async () => {
    const headers = getImportHeaders('basic').map((h) => (h === 'First Name' ? 'First Name *' : h))
    const values = learner()
    const csv = [
      headers.join(','),
      headers.map((h) => values[h.replace(' *', '')] ?? '').join(','),
    ].join('\n')

    const result = await uploadCsv('learners.csv', csv)

    expect(result.missingColumns).toEqual([])
    expect(result.rows[0].values.firstName).toBe('Amina')
  })

  it('tolerates a header retyped with underscores', async () => {
    const headers = getImportHeaders('basic').map((h) =>
      h === 'Date of Birth' ? 'date_of_birth' : h,
    )
    const values = learner()
    const csv = [
      headers.join(','),
      headers.map((h) => values[h === 'date_of_birth' ? 'Date of Birth' : h] ?? '').join(','),
    ].join('\n')

    const result = await uploadCsv('learners.csv', csv)

    expect(result.missingColumns).toEqual([])
    expect(result.rows[0].values.dateOfBirth).toBe('2015-04-17')
  })

  it('reads a senior CSV with a pathway', async () => {
    const result = await uploadCsv(
      'learners.csv',
      csvWithTemplateHeader(
        [
          learner({
            'Date of Birth': '2008-04-17',
            Class: 'Grade 10',
            'Pathway Code': 'STEM',
            'KNEC Assessment No': 'KNEC1',
            'Boarding Status': 'day',
            'Media Consent': 'no',
          }),
        ],
        'senior',
      ),
      'senior',
    )

    expect(result.missingColumns).toEqual([])

    const values = validateRow(result.rows[0], 'senior')
    expect(values.issues).toEqual([])
    expect(values.values.pathwayCode).toBe('STEM')
    expect(values.values.mediaConsent).toBe('false')
  })

  it('reports an empty file rather than importing nothing silently', async () => {
    const result = await uploadCsv('learners.csv', '')
    expect(result.fatal).toBe('That file is empty.')
  })

  it('rejects an unsupported extension by name', async () => {
    const result = await uploadCsv('learners.txt', 'First Name\nAmina')
    expect(result.fatal).toBe('Upload a .xlsx or .csv file.')
  })

  it('reports an unreadable workbook clearly', async () => {
    const { parseUpload: parse } = await import('@/lib/import/parse')
    // Not a real zip container, which is what an .xlsx is.
    const result = await parse(Buffer.from('this is not a workbook'), 'broken.xlsx', 'basic')

    expect(result.fatal).toContain('could not be read')
  })

  it('reads a real xlsx round trip written by the template writer', async () => {
    const { buildImportTemplate } = await import('@/lib/import/template')

    const buffer = await buildImportTemplate({
      mode: 'basic',
      schoolType: 'primary_junior',
      schoolName: 'Test School',
      streams: [
        { classLabel: 'Grade 3', streamLabel: 'A' },
        { classLabel: 'Grade 3', streamLabel: 'B' },
      ],
      pathways: [],
    })

    // The generated template has a worked example on row 2. Feeding it back in
    // must produce zero learners, or a registrar who re-uploads the blank
    // template enrols a fictional child.
    const result = await uploadCsv('x', '')
    expect(result.rows).toEqual([])

    const { parseUpload: parse } = await import('@/lib/import/parse')
    const parsed = await parse(buffer, 'template.xlsx', 'basic')

    expect(parsed.fatal).toBeUndefined()
    expect(parsed.missingColumns).toEqual([])
    expect(parsed.rows).toEqual([])
  })
})

describe('date validation on realistic spreadsheet input', () => {
  it('rejects 31 February', () => {
    const result = validateRow(
      {
        rowNumber: 2,
        values: {
          firstName: 'Amina',
          gender: 'female',
          dateOfBirth: '2015-02-31',
          classLabel: 'Grade 3',
          guardianName: 'Peter',
          guardianPhone: '0723456789',
        },
      },
      'basic',
    )
    expect(result.issues.some((i) => i.column === 'Date of Birth')).toBe(true)
  })

  it('accepts 29 February in a leap year', () => {
    const result = validateRow(
      {
        rowNumber: 2,
        values: {
          firstName: 'Amina',
          gender: 'female',
          dateOfBirth: '2016-02-29',
          classLabel: 'Grade 3',
          guardianName: 'Peter',
          guardianPhone: '0723456789',
        },
      },
      'basic',
    )
    expect(result.issues).toEqual([])
  })

  it('rejects 29 February in a common year', () => {
    const result = validateRow(
      {
        rowNumber: 2,
        values: {
          firstName: 'Amina',
          gender: 'female',
          dateOfBirth: '2015-02-29',
          classLabel: 'Grade 3',
          guardianName: 'Peter',
          guardianPhone: '0723456789',
        },
      },
      'basic',
    )
    expect(result.issues.some((i) => i.column === 'Date of Birth')).toBe(true)
  })
})