'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { EllipsisVerticalIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { isActivePath, MENU_NAV, PILL_NAV } from './nav-items'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

/** Floating pill: four primary screens, then a kebab for the rest. */
export function PillNav() {
  const pathname = usePathname()
  const menuActive = MENU_NAV.some((item) => isActivePath(pathname, item.href))

  return (
    <nav
      aria-label="Main"
      className="flex max-w-full items-center gap-1 rounded-full border border-border bg-surface p-1 shadow-md"
    >
      <ul className="flex items-center gap-1 overflow-x-auto">
        {PILL_NAV.map((item) => {
          const active = isActivePath(pathname, item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative inline-flex items-center rounded-full px-4 py-1.5 text-sm transition-colors',
                  focusRing,
                  // Active: foreground text (black in light, white in dark) plus
                  // a lavender underline bar. The bar is decoration; aria-current
                  // and the bolder weight carry the state.
                  active
                    ? 'font-semibold text-foreground after:absolute after:inset-x-4 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="More"
          className={cn(
            'inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors',
            focusRing,
            menuActive
              ? 'text-foreground ring-2 ring-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          <EllipsisVerticalIcon className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {MENU_NAV.map((item) => (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={item.href}>{item.label}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  )
}
