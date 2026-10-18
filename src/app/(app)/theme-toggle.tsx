'use client'

import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Hydration-safe "have we mounted yet" flag.
 *
 * Uses useSyncExternalStore rather than useEffect+setState: the effect form
 * causes a cascading render and trips react-hooks/set-state-in-effect.
 */
const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  if (!mounted) {
    return <div className="size-9" aria-hidden="true" />
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      <span aria-hidden="true">{isDark ? '☀' : '☾'}</span>
    </Button>
  )
}