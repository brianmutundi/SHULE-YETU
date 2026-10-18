import { describe, expect, it } from 'vitest'
import {
  formatTermLabel,
  isActivePath,
  MENU_NAV,
  PILL_NAV,
} from '@/app/(app)/nav-items'

describe('app shell navigation', () => {
  it('puts only the four everyday screens in the pill', () => {
    expect(PILL_NAV.map((i) => i.label)).toEqual(['Home', 'Students', 'Staff', 'Attendance'])
  })

  it('keeps Gradebook, Classes, Transitions and Settings in the kebab, in that order', () => {
    expect(MENU_NAV.map((i) => [i.label, i.href])).toEqual([
      ['Gradebook', '/assessments'],
      ['Classes', '/classes'],
      ['Transitions', '/transitions'],
      ['Settings', '/settings'],
    ])
  })

  it('matches a route and its children but not a sibling with the same prefix', () => {
    expect(isActivePath('/students', '/students')).toBe(true)
    expect(isActivePath('/students/abc', '/students')).toBe(true)
    expect(isActivePath('/students-archive', '/students')).toBe(false)
  })

  it('formats the period pill as "Term N \u2022 YYYY"', () => {
    expect(formatTermLabel(2, 2026)).toBe('Term 2 \u2022 2026')
  })
})
