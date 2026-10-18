import { describe, expect, it } from 'vitest'
import { buildDateChips, chipWindow } from '@/features/attendance/date-chips'

describe('attendance date chips', () => {
  it('shows seven days ending today', () => {
    const days = chipWindow('2026-10-19', '2026-10-19')
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2026-10-13')
    expect(days[6]).toBe('2026-10-19')
  })

  it('keeps an older selected date inside the window, never past today', () => {
    const days = chipWindow('2026-10-01', '2026-10-19')
    expect(days).toContain('2026-10-01')
    expect(days[6] <= '2026-10-19').toBe(true)
    expect(chipWindow('2026-10-17', '2026-10-19')).toContain('2026-10-17')
  })

  it('crosses a month boundary without a day shift', () => {
    const days = chipWindow('2026-11-02', '2026-11-02')
    expect(days[0]).toBe('2026-10-27')
    expect(days[6]).toBe('2026-11-02')
  })

  it('labels weekday and day, and marks the dotted, selected and today chips', () => {
    const chips = buildDateChips('2026-10-19', '2026-10-19', new Set(['2026-10-16', '2026-10-19']))
    const monday = chips[6]
    expect(monday).toMatchObject({ weekday: 'Mon', day: '19', marked: true, selected: true, isToday: true })
    const friday = chips.find((c) => c.iso === '2026-10-16')
    expect(friday).toMatchObject({ weekday: 'Fri', marked: true, selected: false })
    expect(chips.find((c) => c.iso === '2026-10-15')?.marked).toBe(false)
  })
})
