import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildMonthGrid, termMarkers } from '@/features/dashboard/calendar'
import { breakdownLabel, compactMoney } from '@/features/dashboard/format'
import { parseRange, rangeDates } from '@/features/dashboard/ranges'
import { can, type AppRole } from '@/lib/auth/permissions'

const sql = readFileSync('supabase/migrations/20261018010200_dashboard.sql', 'utf8')
const page = readFileSync('src/app/(app)/home/page.tsx', 'utf8')

describe('payment ranges', () => {
  const term = { openedOn: '2026-08-24', closingOn: '2026-10-30' }

  it('defaults to 30 days and ignores junk', () => {
    expect(parseRange(undefined)).toBe('30d')
    expect(parseRange('forever')).toBe('30d')
    expect(parseRange('term')).toBe('term')
  })

  it('counts a window inclusively, ending today', () => {
    expect(rangeDates('7d', '2026-10-19', null)).toEqual({ from: '2026-10-13', to: '2026-10-19', bucket: 'day' })
    expect(rangeDates('30d', '2026-10-19', null).from).toBe('2026-09-20')
    expect(rangeDates('90d', '2026-10-19', null).bucket).toBe('week')
  })

  it('runs a term from opening to today, or to closing once it has passed', () => {
    expect(rangeDates('term', '2026-10-19', term)).toEqual({ from: '2026-08-24', to: '2026-10-19', bucket: 'week' })
    expect(rangeDates('term', '2026-12-01', term).to).toBe('2026-10-30')
  })

  it('handles a term that has not opened and a missing term', () => {
    expect(rangeDates('term', '2026-08-01', term)).toMatchObject({ from: '2026-08-01', to: '2026-08-01' })
    expect(rangeDates('term', '2026-10-19', null).from).toBe('2026-07-22')
  })

  it('never asks for more than the 400 days the database allows', () => {
    const long = rangeDates('term', '2028-01-01', { openedOn: '2025-01-01', closingOn: '2030-01-01' })
    const days = (Date.parse(long.to) - Date.parse(long.from)) / 86_400_000
    expect(days).toBeLessThanOrEqual(400)
  })
})

describe('calendar', () => {
  it('starts weeks on Monday and pads with neighbouring days', () => {
    const weeks = buildMonthGrid(2026, 9) // October 2026 starts on a Thursday
    expect(weeks[0].map((d) => d.iso)[0]).toBe('2026-09-28')
    expect(weeks[0][3]).toMatchObject({ iso: '2026-10-01', inMonth: true })
    expect(weeks[0][0].inMonth).toBe(false)
    for (const week of weeks) expect(week).toHaveLength(7)
  })

  it('covers the whole month and ends on a full week', () => {
    const days = buildMonthGrid(2026, 1).flat() // February 2026, 28 days, starts Sunday
    expect(days.filter((d) => d.inMonth)).toHaveLength(28)
    expect(days[0].iso).toBe('2026-01-26')
  })

  it('maps term dates to markers', () => {
    const markers = termMarkers({ openedOn: '2026-08-24', midtermBreakOn: '2026-10-08', closingOn: '2026-10-30' })
    expect(markers.get('2026-08-24')).toBe('opens')
    expect(markers.get('2026-10-08')).toBe('midterm')
    expect(markers.get('2026-10-30')).toBe('closes')
  })
})

describe('formatting', () => {
  it('shortens amounts for axes', () => {
    expect(compactMoney(80000)).toBe('KES 800')
    expect(compactMoney(45000000)).toBe('KES 450K')
    expect(compactMoney(125000000)).toBe('KES 1.3M')
    expect(compactMoney(-50000)).toBe('-KES 500')
  })

  it('labels breakdown values and falls back to a readable form', () => {
    expect(breakdownLabel('non_teaching')).toBe('Non-teaching')
    expect(breakdownLabel('unspecified')).toBe('Not stated')
    expect(breakdownLabel('some_new_value')).toBe('some new value')
  })
})

describe('dashboard data comes from the database only', () => {
  it('has one function per widget', () => {
    for (const name of [
      'dashboard_kpis', 'dashboard_population', 'dashboard_staff_breakdown',
      'dashboard_debtors', 'dashboard_payments_series', 'dashboard_transactions',
    ]) {
      expect(sql).toContain(`create or replace function public.${name}(`)
    }
  })

  it('does not query tables directly from the home page', () => {
    expect(page).not.toMatch(/\.from\(/)
    expect(page).not.toMatch(/\.reduce\(/)
  })

  it('guards the money functions with the fee.view role set', () => {
    const roles = ['owner', 'admin', 'head_teacher', 'deputy_head', 'finance', 'bursar'].sort()
    const all: AppRole[] = [
      'owner', 'admin', 'registrar', 'teacher', 'finance', 'viewer', 'head_teacher',
      'deputy_head', 'bursar', 'class_teacher', 'subject_teacher', 'parent',
    ]
    expect(all.filter((r) => can(r, 'fee.view')).sort()).toEqual(roles)
    const guards = [...sql.matchAll(/app\.has_role\(([^)]*)\)/g)].map((m) =>
      [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort(),
    )
    expect(guards.length).toBeGreaterThanOrEqual(4)
    for (const g of guards) expect(g).toEqual(roles)
  })
})
