import { describe, expect, it } from 'vitest'
import { parseCsvText } from '@/lib/import/csv'
import { findDuplicates, validateRow } from '@/lib/import/validate'
import { getImportColumns, getImportHeaders } from '@/lib/import/columns'

/**
 * Bulk import: CSV parsing, row validation and duplicate detection.
 *
 * These are the parts of Phase 7 where a quiet mistake writes the wrong
 * learners into a school register, so they are covered directly rather than
 * only through the UI.
 */

/** A minimal valid basic-mode row. */
const validRow = {
  rowNumber: 3,
  values: {
    firstName: 'Amina',
    otherNames: 'Wanjiru',
    surname: 'Kamau',
    gender: 'female',
    dateOfBirth: '2015-04-17',
    classLabel: 'Grade 3',
    streamLabel: 'A',
    guardianName: 'Peter Kamau',
    guardianPhone: '0723456789',
  },
}

describe('CSV parsing', () => {
  it('splits plain rows', () => {
    expect(parseCsvText('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('keeps commas inside quoted fields', () => {
    // A naive split(',') gets this wrong, and an address is ordinary.
    expect(parseCsvText('name,address\nPeter,"Nairobi, Kenya"')).toEqual([
      ['name', 'address'],
      ['Peter', 'Nairobi, Kenya'],
    ])
  })

  it('unescapes doubled quotes', () => {
    expect(parseCsvText('a\n"She said ""hi"""')).toEqual([['a'], ['She said "hi"']])
  })

  it('keeps newlines inside quoted fields', () => {
    expect(parseCsvText('a,b\n"line1\nline2",x')).toEqual([
      ['a', 'b'],
      ['line1\nline2', 'x'],
    ])
  })

  it('handles CRLF line endings', () => {
    expect(parseCsvText('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('drops trailing blank lines but keeps a final field', () => {
    expect(parseCsvText('a,b\n1,')).toEqual([
      ['a', 'b'],
      ['1', ''],
    ])
  })

  it('returns nothing for an empty file', () => {
    expect(parseCsvText('')).toEqual([])
    expect(parseCsvText('\n\n\n')).toEqual([])
  })
})

describe('row validation', () => {
  it('accepts a well-formed basic-mode row', () => {
    const result = validateRow(validRow, 'basic')
    expect(result.issues).toEqual([])
  })

  it('normalizes a guardian phone to E.164', () => {
    const result = validateRow(validRow, 'basic')
    expect(result.values.guardianPhone).toBe('+254723456789')
  })

  it('normalizes a phone already written as +254', () => {
    const result = validateRow(
      { rowNumber: 3, values: { ...validRow.values, guardianPhone: '+254723456789' } },
      'basic',
    )
    expect(result.issues).toEqual([])
    expect(result.values.guardianPhone).toBe('+254723456789')
  })

  it('lowercases gender so "Female" is accepted', () => {
    const result = validateRow({ rowNumber: 3, values: { ...validRow.values, gender: 'Female' } }, 'basic')
    expect(result.issues).toEqual([])
    expect(result.values.gender).toBe('female')
  })

  it('requires a first name', () => {
    const result = validateRow({ rowNumber: 3, values: { ...validRow.values, firstName: '' } }, 'basic')
    expect(result.issues.some((i) => i.column === 'First Name')).toBe(true)
  })

  it('requires a guardian phone', () => {
    const result = validateRow({ rowNumber: 3, values: { ...validRow.values, guardianPhone: '' } }, 'basic')
    expect(result.issues.some((i) => i.column === 'Guardian Phone')).toBe(true)
  })

  it('rejects a phone that is not Kenyan', () => {
    const result = validateRow(
      { rowNumber: 3, values: { ...validRow.values, guardianPhone: '+15551234567' } },
      'basic',
    )
    expect(result.issues.some((i) => i.column === 'Guardian Phone')).toBe(true)
  })

  it('rejects a non-ISO date and says what format to use', () => {
    const result = validateRow(
      { rowNumber: 3, values: { ...validRow.values, dateOfBirth: '17/04/2015' } },
      'basic',
    )
    expect(result.issues.some((i) => i.message.includes('YYYY-MM-DD'))).toBe(true)
  })

  it('rejects a well-formatted but impossible date', () => {
    // Passes the regex, fails the calendar check.
    const result = validateRow({ rowNumber: 3, values: { ...validRow.values, dateOfBirth: '2015-02-30' } }, 'basic')
    expect(result.issues.some((i) => i.column === 'Date of Birth')).toBe(true)
  })

  it('defaults status to active when left blank', () => {
    const result = validateRow(validRow, 'basic')
    expect(result.values.status).toBe('active')
  })

  it('rejects a status outside the allowed set', () => {
    // graduated is a real enum value but not valid on an import row.
    const result = validateRow({ rowNumber: 3, values: { ...validRow.values, status: 'graduated' } }, 'basic')
    expect(result.issues.some((i) => i.column === 'Status')).toBe(true)
  })

  it('treats a blank optional email as fine but a malformed one as an error', () => {
    expect(validateRow(validRow, 'basic').issues).toEqual([])

    const bad = validateRow({ rowNumber: 3, values: { ...validRow.values, email: 'not-an-email' } }, 'basic')
    expect(bad.issues.some((i) => i.column === 'Email')).toBe(true)
  })
})

describe('mode awareness', () => {
  it('omits every senior-only column in basic mode', () => {
    const headers = getImportHeaders('basic')
    expect(headers).not.toContain('Pathway Code')
    expect(headers).not.toContain('House')
    expect(headers).not.toContain('Boarding Status')
  })

  it('includes senior columns in senior mode', () => {
    const headers = getImportHeaders('senior')
    expect(headers).toContain('Pathway Code')
    expect(headers).toContain('KNEC Assessment No')
  })

  it('requires a pathway in senior mode but not in basic mode', () => {
    // The same values: fine for a primary school, incomplete for a senior one.
    expect(validateRow(validRow, 'basic').issues).toEqual([])
    expect(validateRow(validRow, 'senior').issues.some((i) => i.column === 'Pathway Code')).toBe(true)
  })

  it('accepts the same row in senior mode once a pathway is supplied', () => {
    const result = validateRow({ rowNumber: 3, values: { ...validRow.values, pathwayCode: 'STEM' } }, 'senior')
    expect(result.issues).toEqual([])
  })

  it('converts media consent to a boolean for the payload', () => {
    const result = validateRow(
      { rowNumber: 3, values: { ...validRow.values, pathwayCode: 'STEM', mediaConsent: 'yes' } },
      'senior',
    )
    expect(result.values.mediaConsent).toBe('true')
  })

  it('defaults media consent to false rather than granting it silently', () => {
    const result = validateRow({ rowNumber: 3, values: { ...validRow.values, pathwayCode: 'STEM' } }, 'senior')
    expect(result.values.mediaConsent).toBe('false')
  })
})

describe('duplicate detection', () => {
  // Typed as a validated row, not as the literal `validRow` shape: duplicate
  // detection is exercised with extra fields (upi, studentNo) that are not in
  // the base fixture, so the helper has to accept any string key.
  const row = (over: Record<string, string>, rowNumber: number) => ({
    rowNumber,
    values: { ...validRow.values, ...over },
    issues: [] as { field: string | null; column: string | null; message: string }[],
  })

  it('flags a repeated admission number', () => {
    const rows = [row({ studentNo: 'A26001' }, 3), row({ studentNo: 'a26001' }, 4)]
    const duplicates = findDuplicates(rows)

    // Case-insensitive: admission numbers are read off paper and typed.
    expect(duplicates.get(4)?.[0].column).toBe('Admission No')
  })

  it('flags a repeated UPI', () => {
    const rows = [row({ upi: 'ABC123' }, 3), row({ upi: 'ABC123' }, 4)]
    expect(findDuplicates(rows).get(4)?.[0].column).toBe('UPI')
  })

  it('does not flag the first occurrence', () => {
    const rows = [row({ upi: 'ABC123' }, 3), row({ upi: 'XYZ789' }, 4)]
    expect(findDuplicates(rows).has(3)).toBe(false)
  })

  it('flags the same name, date of birth and guardian phone', () => {
    const rows = [row({}, 3), row({}, 4)]
    expect(findDuplicates(rows).get(4)?.[0].message).toContain('row 3')
  })

  it('does NOT flag siblings sharing a guardian', () => {
    // Same guardian, different children. This is the common case in a real
    // register and flagging it would make the feature useless.
    const rows = [
      row({ firstName: 'Amina' }, 3),
      row({ firstName: 'Joseph', dateOfBirth: '2017-01-02' }, 4),
    ]
    expect(findDuplicates(rows).size).toBe(0)
  })

  it('does not flag twins only on surname', () => {
    // Same name, different date of birth.
    const rows = [row({}, 3), row({ dateOfBirth: '2015-04-18' }, 4)]
    expect(findDuplicates(rows).size).toBe(0)
  })

  it('reports the duplicate on the later row only', () => {
    const rows = [row({ upi: 'ABC123' }, 3), row({ upi: 'ABC123' }, 4)]
    const duplicates = findDuplicates(rows)

    expect(duplicates.has(3)).toBe(false)
    expect(duplicates.has(4)).toBe(true)
  })

  it('finds no duplicates in a clean file', () => {
    // Each row must differ in name AND date of birth, not just in UPI: three
    // rows sharing a name and DOB but holding different UPIs are still the
    // same learner three times.
    const rows = [
      row({ upi: 'ABC123', studentNo: 'A26001', firstName: 'Amina', dateOfBirth: '2015-04-17' }, 3),
      row({ upi: 'XYZ789', studentNo: 'A26002', firstName: 'Brian', dateOfBirth: '2015-06-02' }, 4),
      row({ studentNo: 'A26003', firstName: 'Carol', dateOfBirth: '2016-01-09' }, 5),
    ]
    expect(findDuplicates(rows).size).toBe(0)
  })
})

describe('column contract', () => {
  it('marks exactly the fields a row cannot do without', () => {
    const required = getImportColumns('basic')
      .filter((c) => c.required)
      .map((c) => c.key)

    expect(required).toEqual(['firstName', 'gender', 'dateOfBirth', 'classLabel', 'guardianName', 'guardianPhone'])
  })

  it('has no duplicate column keys', () => {
    const keys = getImportColumns('senior').map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('has no duplicate headers, since a spreadsheet cannot hold two of them', () => {
    const headers = getImportHeaders('senior')
    expect(new Set(headers).size).toBe(headers.length)
  })
})