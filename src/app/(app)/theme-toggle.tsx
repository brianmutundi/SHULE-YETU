'use client'

import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'
import { MoonIcon, SunIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Hydration-safe "have we mounted yet" flag.
 *
 * Uses useSyncExternalStore rather than useEffect+setState: the effect form
 * causes a cascading render and trips react-hooks/set-state-in-effect.
 */
const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

/** Switch-style toggle. "On" means dark. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  if (!mounted) {
    return <div className="h-7 w-12" aria-hidden="true" />
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Dark theme"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-border transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        isDark ? 'bg-primary-soft' : 'bg-surface-2',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform',
          isDark ? 'translate-x-6' : 'translate-x-1',
        )}
      >
        {isDark ? <MoonIcon className="size-3" /> : <SunIcon className="size-3" />}
      </span>
    </button>
  )
}
