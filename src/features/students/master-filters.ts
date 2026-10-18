import type { Database } from '@/lib/supabase/types'
import type { ChipTone } from '@/components/shared/chip'

export type StudentStatus = Database['public']['Enums']['student_status']

export const STATUS_VALUES: readonly StudentStatus[] = [
  'active',
  'inactive',
  'completed',
  'graduated',
  'transferred',
  'withdrawn',
  'draft',
]

export type StatusFilter = StudentStatus | 'all'
export const DEFAULT_STATUS_FILTER: StatusFilter = 'active'

/** Anything unrecognised falls back to the default rather than to "all". */
export function parseStatusFilter(raw: string | null | undefined): StatusFilter {
  if (raw === 'all') return 'all'
  return STATUS_VALUES.find((s) => s === raw) ?? DEFAULT_STATUS_FILTER
}

export const QUICK_FILTERS = ['male', 'female', 'waiver'] as const
export type QuickFilter = (typeof QUICK_FILTERS)[number]

export function parseQuickFilters(raw: string | null | undefined): QuickFilter[] {
  const wanted = new Set((raw ?? '').split(','))
  return QUICK_FILTERS.filter((f) => wanted.has(f))
}

/** Boys and girls are exclusive in a single-select sense; the rest toggle. */
export function toggleQuickFilter(current: QuickFilter[], filter: QuickFilter): QuickFilter[] {
  if (current.includes(filter)) return current.filter((f) => f !== filter)
  const without =
    filter === 'male'
      ? current.filter((f) => f !== 'female')
      : filter === 'female'
        ? current.filter((f) => f !== 'male')
        : current
  return QUICK_FILTERS.filter((f) => f === filter || without.includes(f))
}

export function statusTone(status: string): ChipTone {
  switch (status) {
    case 'active':
      return 'status'
    case 'completed':
    case 'graduated':
      return 'class'
    case 'transferred':
    case 'withdrawn':
      return 'warning'
    default:
      return 'neutral'
  }
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  parent: 'Parent',
  grandparent: 'Grandparent',
  sibling: 'Sibling',
  aunt_uncle: 'Aunt or uncle',
  relative: 'Relative',
  guardian: 'Guardian',
  other: 'Other',
}

export function relationshipLabel(value: string): string {
  return RELATIONSHIP_LABELS[value] ?? value.replace(/_/g, ' ')
}

export function capitalise(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value
}
