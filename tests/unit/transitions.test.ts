import { describe, expect, it } from 'vitest'
import {
  createYearSchema,
  promotionSchema,
  rollbackSchema,
  runPromotionSchema,
  sessionSchema,
  STRATEGY_LABELS,
  STREAM_STRATEGIES,
} from '@/features/transitions/schema'
import { getTerminalStatus, isExitCheckpointClass } from '@/lib/school-type'

/**
 * Transitions: form validation and the mode-aware promotion chain.
 *
 * The date rules matter most. A term whose closing date precedes its opening
 * date would silently corrupt attendance periods and fee calculation, and the
 * rejection has to happen before the database rather than as a constraint
 * violation the admin reads as a crash.
 */

describe('academic year validation', () => {
  it('accepts a year in range', () => {
    expect(createYearSchema.safeParse({ calendarYear: '2027' }).success).toBe(true)
  })

  it('coerces a string from the form', () => {
    const result = createYearSchema.safeParse({ calendarYear: '2027' })
    expect(result.success && result.data.calendarYear).toBe(2027)
  })

  it('rejects a year outside 2000-2100', () => {
    expect(createYearSchema.safeParse({ calendarYear: 1999 }).success).toBe(false)
    expect(createYearSchema.safeParse({ calendarYear: 2101 }).success).toBe(false)
  })

  it('rejects a fractional year', () => {
    expect(createYearSchema.safeParse({ calendarYear: 2027.5 }).success).toBe(false)
  })
})

describe('term validation', () => {
  const valid = {
    sessionId: '',
    name: 'Term 1',
    termNumber: 1,
    openedOn: '2027-01-06',
    midtermBreakOn: '2027-03-27',
    closingOn: '2027-04-10',
  }

  it('accepts a well-formed term', () => {
    expect(sessionSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts a term with no midterm break', () => {
    expect(sessionSchema.safeParse({ ...valid, midtermBreakOn: '' }).success).toBe(true)
  })

  it('rejects a closing date on or before opening', () => {
    expect(sessionSchema.safeParse({ ...valid, closingOn: '2027-01-06' }).success).toBe(false)
    expect(sessionSchema.safeParse({ ...valid, closingOn: '2027-01-01' }).success).toBe(false)
  })

  it('rejects a midterm break outside the term', () => {
    // Before opening, after closing, or on a boundary date.
    expect(sessionSchema.safeParse({ ...valid, midtermBreakOn: '2027-01-01' }).success).toBe(false)
    expect(sessionSchema.safeParse({ ...valid, midtermBreakOn: '2027-05-01' }).success).toBe(false)
    expect(sessionSchema.safeParse({ ...valid, midtermBreakOn: '2027-01-06' }).success).toBe(false)
    expect(sessionSchema.safeParse({ ...valid, midtermBreakOn: '2027-04-10' }).success).toBe(false)
  })

  it('rejects a non-ISO date', () => {
    expect(sessionSchema.safeParse({ ...valid, openedOn: '06/01/2027' }).success).toBe(false)
  })

  it('rejects a term number outside 1-3', () => {
    expect(sessionSchema.safeParse({ ...valid, termNumber: 4 }).success).toBe(false)
    expect(sessionSchema.safeParse({ ...valid, termNumber: 0 }).success).toBe(false)
  })

  it('requires a name', () => {
    expect(sessionSchema.safeParse({ ...valid, name: '  ' }).success).toBe(false)
  })

  it('points the error at the offending field', () => {
    const result = sessionSchema.safeParse({ ...valid, closingOn: '2027-01-01' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('closingOn'))).toBe(true)
    }
  })
})

describe('promotion validation', () => {
  const base = {
    fromYear: '11111111-1111-4111-8111-111111111111',
    toYear: '22222222-2222-4222-8222-222222222222',
    strategy: 'keep',
  }

  it('accepts both strategies', () => {
    for (const strategy of STREAM_STRATEGIES) {
      expect(promotionSchema.safeParse({ ...base, strategy }).success).toBe(true)
    }
  })

  it('rejects an unknown strategy', () => {
    expect(promotionSchema.safeParse({ ...base, strategy: 'random' }).success).toBe(false)
  })

  it('requires uuid years', () => {
    expect(promotionSchema.safeParse({ ...base, fromYear: 'nope' }).success).toBe(false)
  })

  it('validates the commit payload', () => {
    expect(
      runPromotionSchema.safeParse({ ...base, note: 'end of year' }).success,
    ).toBe(true)
    expect(runPromotionSchema.safeParse({ fromYear: base.fromYear }).success).toBe(false)
  })

  it('caps the note length so a run cannot carry an essay', () => {
    expect(runPromotionSchema.safeParse({ ...base, note: 'x'.repeat(201) }).success).toBe(false)
  })

  it('validates rollback', () => {
    expect(rollbackSchema.safeParse({ runId: base.fromYear }).success).toBe(true)
    expect(rollbackSchema.safeParse({ runId: 'nope' }).success).toBe(false)
  })
})

describe('stream strategy labels', () => {
  it('describes both options without claiming one is correct', () => {
    // [A11] is a genuine school-by-school choice, so neither label may read as
    // the recommended default in the copy.
    for (const value of STREAM_STRATEGIES) {
      expect(STRATEGY_LABELS[value].label.length).toBeGreaterThan(0)
      expect(STRATEGY_LABELS[value].help.length).toBeGreaterThan(0)
      expect(STRATEGY_LABELS[value].label.toLowerCase()).not.toContain('should')
      expect(STRATEGY_LABELS[value].label.toLowerCase()).not.toContain('must')
    }
  })
})

describe('exit checkpoints are mode-aware', () => {
  it('holds Grade 6 for KPSEA in a primary school', () => {
    expect(isExitCheckpointClass('primary', 'Grade 6')).toBe(true)
  })

  it('does not hold Grade 6 in a junior school', () => {
    // A junior school runs Grade 7-9; Grade 6 is not its checkpoint class.
    expect(isExitCheckpointClass('junior', 'Grade 6')).toBe(false)
    expect(isExitCheckpointClass('junior', 'Grade 9')).toBe(true)
  })

  it('holds both checkpoints in a combined primary and junior school', () => {
    expect(isExitCheckpointClass('primary_junior', 'Grade 6')).toBe(true)
    expect(isExitCheckpointClass('primary_junior', 'Grade 9')).toBe(true)
  })

  it('never holds a senior school', () => {
    for (const label of ['Grade 10', 'Grade 11', 'Grade 12']) {
      expect(isExitCheckpointClass('senior', label)).toBe(false)
    }
  })

  it('marks the terminal class completed in basic mode', () => {
    expect(getTerminalStatus('primary', 'Grade 6')).toBe('completed')
    expect(getTerminalStatus('junior', 'Grade 9')).toBe('completed')
  })

  it('marks the terminal class graduated in senior mode', () => {
    expect(getTerminalStatus('senior', 'Grade 12')).toBe('graduated')
  })

  it('returns null for a class that is not terminal', () => {
    expect(getTerminalStatus('primary', 'Grade 3')).toBeNull()
    expect(getTerminalStatus('senior', 'Grade 10')).toBeNull()
  })
})