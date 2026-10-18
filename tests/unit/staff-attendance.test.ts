import { describe, expect, it } from 'vitest'
import {
  ATTENDANCE_STATUSES,
  attendanceBatchSchema,
  attendanceTone,
  EXCUSE_REASONS,
  FAIR_ATTENDANCE_RATE,
  GOOD_ATTENDANCE_RATE,
} from '@/features/attendance/schema'
import {
  EMPLOYERS,
  staffDirectorySchema,
  staffSchema,
  STAFF_TYPES,
  assignmentSchema,
} from '@/features/staff/schema'

/**
 * Staff and attendance validation.
 *
 * The attendance rules are the ones worth pinning: an excused absence without a
 * reason is the difference between a register a school can trust and one that
 * quietly records unverified absences, and it is the kind of thing that gets
 * skipped in a client-side check.
 */

const LEARNER_A = '11111111-1111-4111-8111-111111111111'
const LEARNER_B = '22222222-2222-4222-8222-222222222222'
const STREAM = '33333333-3333-4333-8333-333333333333'

describe('staff validation', () => {
  const valid = {
    fullName: 'Jane Doe',
    gender: 'female',
    staffType: 'teaching',
    employer: 'tsc',
    employmentType: 'Permanent',
    tscNumber: 'TSC-001',
    phone: '0723456789',
    email: 'jane@example.com',
    address: '',
    hiredOn: '2020-01-06',
    status: 'active',
    kraPin: '',
    nssfShaNumber: '',
    nationalId: '',
  }

  it('accepts a well-formed staff record', () => {
    expect(staffSchema.safeParse(valid).success).toBe(true)
  })

  it('requires a name', () => {
    expect(staffSchema.safeParse({ ...valid, fullName: '   ' }).success).toBe(false)
  })

  it('accepts every staff type and employer', () => {
    for (const staffType of STAFF_TYPES) {
      expect(staffSchema.safeParse({ ...valid, staffType }).success).toBe(true)
    }
    for (const employer of EMPLOYERS) {
      expect(staffSchema.safeParse({ ...valid, employer }).success).toBe(true)
    }
  })

  it('rejects an unknown staff type', () => {
    expect(staffSchema.safeParse({ ...valid, staffType: 'principal' }).success).toBe(false)
  })

  it('normalizes a Kenyan phone to E.164', () => {
    const result = staffSchema.safeParse(valid)
    expect(result.success && result.data.phone).toBe('+254723456789')
  })

  it('rejects a non-Kenyan phone', () => {
    expect(staffSchema.safeParse({ ...valid, phone: '+15551234567' }).success).toBe(false)
  })

  it('allows a blank email but not a malformed one', () => {
    expect(staffSchema.safeParse({ ...valid, email: '' }).success).toBe(true)
    expect(staffSchema.safeParse({ ...valid, email: 'nope' }).success).toBe(false)
  })

  it('defaults the directory filters to all', () => {
    const result = staffDirectorySchema.safeParse({})
    expect(result.success && result.data).toEqual({
      search: undefined,
      staffType: 'all',
      employer: 'all',
      status: 'all',
    })
  })
})

describe('teaching assignment validation', () => {
  const base = {
    staffId: LEARNER_A,
    academicYearId: LEARNER_B,
    scope: 'class_teacher',
    streamId: STREAM,
    subjectId: '',
    learningAreaId: '',
  }

  it('accepts a class teacher on a stream', () => {
    expect(assignmentSchema.safeParse(base).success).toBe(true)
  })

  it('rejects a class teacher with no stream', () => {
    // Ambiguous: which of the class's streams are they responsible for?
    const result = assignmentSchema.safeParse({ ...base, streamId: '' })
    expect(result.success).toBe(false)
  })

  it('rejects a subject teacher with neither subject nor learning area', () => {
    const result = assignmentSchema.safeParse({
      ...base,
      scope: 'subject_teacher',
    })
    expect(result.success).toBe(false)
  })

  it('accepts a subject teacher with a learning area', () => {
    expect(
      assignmentSchema.safeParse({ ...base, scope: 'subject_teacher', learningAreaId: STREAM })
        .success,
    ).toBe(true)
  })

  it('requires a staff member and a year', () => {
    expect(assignmentSchema.safeParse({ ...base, staffId: '' }).success).toBe(false)
    expect(assignmentSchema.safeParse({ ...base, academicYearId: 'nope' }).success).toBe(false)
  })
})

describe('attendance batch validation', () => {
  const base = {
    streamId: STREAM,
    date: '2026-03-02',
    entries: [{ studentId: LEARNER_A, status: 'present' }],
  }

  it('accepts a simple batch', () => {
    expect(attendanceBatchSchema.safeParse(base).success).toBe(true)
  })

  it('accepts every status', () => {
    for (const status of ATTENDANCE_STATUSES) {
      const entries =
        status === 'excused'
          ? [{ studentId: LEARNER_A, status, excuseReason: 'sick' }]
          : [{ studentId: LEARNER_A, status }]
      expect(attendanceBatchSchema.safeParse({ ...base, entries }).success).toBe(true)
    }
  })

  it('rejects an excused absence with no reason', () => {
    // The case the column constraint would catch in the database; catching it
    // here means the teacher is told before anything is written.
    const result = attendanceBatchSchema.safeParse({
      ...base,
      entries: [{ studentId: LEARNER_A, status: 'excused' }],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('needs a reason')
    }
  })

  it('rejects a reason on a learner who is present', () => {
    const result = attendanceBatchSchema.safeParse({
      ...base,
      entries: [{ studentId: LEARNER_A, status: 'present', excuseReason: 'sick' }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts every excuse reason on an excused absence', () => {
    for (const excuseReason of EXCUSE_REASONS) {
      expect(
        attendanceBatchSchema.safeParse({
          ...base,
          entries: [{ studentId: LEARNER_A, status: 'excused', excuseReason }],
        }).success,
      ).toBe(true)
    }
  })

  it('rejects a reason outside the allowed set', () => {
    const result = attendanceBatchSchema.safeParse({
      ...base,
      entries: [{ studentId: LEARNER_A, status: 'excused', excuseReason: 'truancy' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects an empty batch', () => {
    expect(attendanceBatchSchema.safeParse({ ...base, entries: [] }).success).toBe(false)
  })

  it('rejects a non-ISO date', () => {
    expect(attendanceBatchSchema.safeParse({ ...base, date: '02/03/2026' }).success).toBe(false)
  })

  it('reports every bad entry, not just the first', () => {
    // A teacher marking 40 learners should learn about all four problems at
    // once rather than fixing one and re-submitting three more times.
    const result = attendanceBatchSchema.safeParse({
      ...base,
      entries: [
        { studentId: LEARNER_A, status: 'excused' },
        { studentId: LEARNER_B, status: 'present', excuseReason: 'sick' },
        { studentId: LEARNER_A, status: 'present' },
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('accepts a mixed batch where only the excused entry needs a reason', () => {
    expect(
      attendanceBatchSchema.safeParse({
        ...base,
        entries: [
          { studentId: LEARNER_A, status: 'present' },
          { studentId: LEARNER_B, status: 'absent' },
          { studentId: LEARNER_A, status: 'excused', excuseReason: 'permission' },
        ],
      }).success,
    ).toBe(true)
  })
})

describe('attendance rate tone', () => {
  it('treats no record as no tone rather than poor attendance', () => {
    // An unmarked learner has not been absent; showing a red bar would read as
    // a judgement the data does not support.
    expect(attendanceTone(null)).toBe('none')
  })

  it('bands rates at the documented thresholds', () => {
    expect(attendanceTone(100)).toBe('good')
    expect(attendanceTone(GOOD_ATTENDANCE_RATE)).toBe('good')
    expect(attendanceTone(GOOD_ATTENDANCE_RATE - 0.1)).toBe('fair')
    expect(attendanceTone(FAIR_ATTENDANCE_RATE)).toBe('fair')
    expect(attendanceTone(FAIR_ATTENDANCE_RATE - 0.1)).toBe('poor')
    expect(attendanceTone(0)).toBe('poor')
  })
})