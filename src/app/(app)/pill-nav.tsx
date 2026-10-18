'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { hasBoardingModule, type OperatingMode } from '@/lib/school-type'

interface NavItem {
  href: string
  label: string
  /** Omitted when the item applies to every operating mode. */
  seniorOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/home', label: 'Home' },
  { href: '/students', label: 'Students' },
  { href: '/staff', label: 'Staff' },
  { href: '/attendance', label: 'Attendance' },
  { href: '/assessments', label: 'Assessments' },
  { href: '/boarding', label: 'Boarding', seniorOnly: true },
  { href: '/settings', label: 'Settings' },
]

export function PillNav({ mode }: { mode: OperatingMode }) {
  const pathname = usePathname()

  const items = NAV_ITEMS.filter((item) => !item.seniorOnly || hasBoardingModule(mode))

  return (
    <nav aria-label="Main">
      <ul className="flex flex-wrap items-center gap-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  active
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}