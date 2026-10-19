/** "KES 1.2M", "KES 450K", "KES 800": axis labels, where full figures will not fit. */
export function compactMoney(minor: number, currency = 'KES'): string {
  const whole = minor / 100
  const abs = Math.abs(whole)
  const sign = whole < 0 ? '-' : ''
  const trim = (n: number) => String(Number(n.toFixed(1)))

  if (abs >= 1_000_000) return `${sign}${currency} ${trim(abs / 1_000_000)}M`
  if (abs >= 1_000) return `${sign}${currency} ${trim(abs / 1_000)}K`
  return `${sign}${currency} ${trim(abs)}`
}

const LABELS: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  unspecified: 'Not stated',
  teaching: 'Teaching',
  non_teaching: 'Non-teaching',
  admin: 'Admin',
  bom: 'BOM',
  tsc: 'TSC',
  private: 'Private',
}

/** Display label for a value returned by dashboard_staff_breakdown. */
export function breakdownLabel(value: string): string {
  return LABELS[value] ?? value.replace(/_/g, ' ')
}

export const STAFF_DIMENSIONS = ['gender', 'staff_type', 'employer'] as const
export type StaffDimension = (typeof STAFF_DIMENSIONS)[number]

export const STAFF_DIMENSION_LABELS: Record<StaffDimension, string> = {
  gender: 'Gender',
  staff_type: 'Staff Type',
  employer: 'Employer',
}

/** "19 Oct" from a yyyy-MM-dd bucket date, for chart axes. */
export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}
