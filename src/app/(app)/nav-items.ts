/**
 * Navigation contract for the app shell.
 *
 * Kept free of React so it can be unit-tested. The pill carries the four
 * everyday screens. Everything else lives in the kebab menu.
 */
export interface NavItem {
  href: string
  label: string
}

export const PILL_NAV: readonly NavItem[] = [
  { href: '/home', label: 'Home' },
  { href: '/students', label: 'Students' },
  { href: '/staff', label: 'Staff' },
  { href: '/attendance', label: 'Attendance' },
]

/** "Gradebook" is the assessments module (CLAUDE.md section 7.15). */
export const MENU_NAV: readonly NavItem[] = [
  { href: '/assessments', label: 'Gradebook' },
  { href: '/classes', label: 'Classes' },
  { href: '/transitions', label: 'Transitions' },
  { href: '/settings', label: 'Settings' },
]

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** "Term 2 \u2022 2026": the label on the period pill under the school name. */
export function formatTermLabel(termNumber: number, calendarYear: number): string {
  return `Term ${termNumber} \u2022 ${calendarYear}`
}
