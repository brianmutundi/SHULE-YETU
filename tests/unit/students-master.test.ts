import { describe, expect, it } from 'vitest'
import { initialsOf } from '@/components/shared/avatar'
import {
  parseQuickFilters,
  parseStatusFilter,
  relationshipLabel,
  statusTone,
  toggleQuickFilter,
} from '@/features/students/master-filters'
import { summarizeAttendance } from '@/features/students/attendance-summary'
import { formatDate, todayInNairobi } from '@/lib/dates'
import { fullNameOf } from '@/features/students/name'
import { buildPhotoPath, MAX_PHOTO_BYTES, photoExtension, validatePhoto } from '@/features/students/photo'
import { quickCreateStudentSchema } from '@/features/students/schema'

describe('status filter', () => {
  it('defaults to active and ignores unknown values', () => {
    expect(parseStatusFilter(undefined)).toBe('active')
    expect(parseStatusFilter('nonsense')).toBe('active')
    expect(parseStatusFilter('')).toBe('active')
  })

  it('accepts a real status and the explicit all option', () => {
    expect(parseStatusFilter('withdrawn')).toBe('withdrawn')
    expect(parseStatusFilter('all')).toBe('all')
  })

  it('colours statuses per CLAUDE.md section 8', () => {
    expect(statusTone('active')).toBe('status')
    expect(statusTone('inactive')).toBe('neutral')
    expect(statusTone('graduated')).toBe('class')
    expect(statusTone('completed')).toBe('class')
    expect(statusTone('transferred')).toBe('warning')
    expect(statusTone('withdrawn')).toBe('warning')
  })
})

describe('quick filters', () => {
  it('parses a comma list and drops unknown entries', () => {
    expect(parseQuickFilters('female,waiver,bogus')).toEqual(['female', 'waiver'])
    expect(parseQuickFilters(null)).toEqual([])
  })

  it('treats boys and girls as mutually exclusive but keeps waiver', () => {
    expect(toggleQuickFilter(['female', 'waiver'], 'male')).toEqual(['male', 'waiver'])
    expect(toggleQuickFilter(['male'], 'male')).toEqual([])
  })
})

describe('attendance summary', () => {
  it('returns a null rate and no last absence for an empty record', () => {
    expect(summarizeAttendance([])).toEqual({
      markedDays: 0,
      absentDays: 0,
      ratePct: null,
      lastAbsent: null,
    })
  })

  it('counts late as attended, leaves excused out, and finds the latest absence', () => {
    const summary = summarizeAttendance([
      { date: '2026-10-12', status: 'absent' },
      { date: '2026-10-13', status: 'present' },
      { date: '2026-10-14', status: 'late' },
      { date: '2026-10-15', status: 'excused' },
      { date: '2026-10-09', status: 'absent' },
    ])
    expect(summary.markedDays).toBe(5)
    expect(summary.absentDays).toBe(2)
    expect(summary.ratePct).toBe(50)
    expect(summary.lastAbsent).toBe('2026-10-12')
  })
})

describe('display helpers', () => {
  it('builds initials without throwing on empty names', () => {
    expect(initialsOf('Amina Wanjiru Otieno')).toBe('AO')
    expect(initialsOf('Amina')).toBe('A')
    expect(initialsOf('')).toBe('?')
    expect(initialsOf(null)).toBe('?')
  })

  it('labels every relationship, including the two-word one', () => {
    expect(relationshipLabel('aunt_uncle')).toBe('Aunt or uncle')
    expect(relationshipLabel('parent')).toBe('Parent')
  })
})

describe('formatDate', () => {
  it('prints a date-only value without shifting the day', () => {
    expect(formatDate('2026-10-12')).toBe('12 Oct 2026')
  })

  it('returns the fallback for null and garbage instead of throwing', () => {
    expect(formatDate(null)).toBe('Not recorded')
    expect(formatDate('not a date', '-')).toBe('-')
  })
})

describe('registration', () => {
  it('joins names without printing null or stray spaces', () => {
    expect(fullNameOf('Amina', null, null)).toBe('Amina')
    expect(fullNameOf('Amina', undefined, 'Otieno')).toBe('Amina Otieno')
    expect(fullNameOf('Amina', '  ', 'Otieno')).toBe('Amina Otieno')
    expect(fullNameOf('Amina', 'Wanjiru', 'Otieno')).toBe('Amina Wanjiru Otieno')
  })

  it('accepts only small JPEG, PNG or WebP photos', () => {
    expect(validatePhoto({ type: 'image/png', size: 1000 })).toBeNull()
    expect(validatePhoto({ type: 'image/gif', size: 1000 })).toMatch(/JPEG, PNG or WebP/)
    expect(validatePhoto({ type: 'image/jpeg', size: 0 })).toMatch(/empty/)
    expect(validatePhoto({ type: 'image/jpeg', size: MAX_PHOTO_BYTES + 1 })).toMatch(/2 MB/)
    expect(photoExtension('image/webp')).toBe('webp')
    expect(photoExtension('application/pdf')).toBeNull()
  })

  it('puts the tenant id first in the photo path, which the storage policy relies on', () => {
    expect(buildPhotoPath('tenant-1', 'stu-9', 'abc', 'jpg')).toBe('tenant-1/stu-9-abc.jpg')
  })

  it('gives the date in Nairobi, not UTC, around midnight', () => {
    // 22:30 UTC on 17 Oct is 01:30 on 18 Oct in Nairobi (UTC+3).
    expect(todayInNairobi(new Date('2026-10-17T22:30:00Z'))).toBe('2026-10-18')
  })

  it('takes the new registration fields and keeps them optional', () => {
    const base = { firstName: 'Amina', gender: 'female', dateOfBirth: '2016-03-04' }
    const minimal = quickCreateStudentSchema.parse(base)
    expect(minimal.tuitionWaiver).toBe(false)
    expect(minimal.mediaConsent).toBe(false)

    const full = quickCreateStudentSchema.parse({
      ...base,
      nationality: 'Kenyan',
      religion: 'Christian',
      address: 'Kisumu',
      tuitionWaiver: true,
      admittedOn: '2026-10-18',
      sessionId: '8c1d3a3e-5f0b-4a54-9d3f-1b2c3d4e5f60',
    })
    expect(full.tuitionWaiver).toBe(true)
    expect(full.admittedOn).toBe('2026-10-18')
    expect(() => quickCreateStudentSchema.parse({ ...base, admittedOn: '18/10/2026' })).toThrow()
  })
})
