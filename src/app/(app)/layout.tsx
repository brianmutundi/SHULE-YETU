import { Suspense } from 'react'
import Link from 'next/link'
import { LogOutIcon, SettingsIcon } from 'lucide-react'
import { getSessionContext } from '@/lib/auth/session'
import { signOut } from '@/features/onboarding/actions'
import { Button } from '@/components/ui/button'
import { PillNav } from './pill-nav'
import { ThemeToggle } from './theme-toggle'
import { TermPill } from './term-pill'

// Resolves the session from cookies, so this layout cannot be prerendered.
// Required on the layout as well as each page under Cache Components.
export const instant = false

export default async function AppLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  /** Intercepted routes (Classes, Transitions) render here as modals. */
  modal: React.ReactNode
}) {
  const session = await getSessionContext()

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-3 z-20 mx-auto print:hidden flex w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4">
        <div className="flex min-w-0 flex-col items-start gap-1">
          <Link href="/home" className="truncate font-semibold tracking-tight">
            {session.tenantName}
          </Link>
          <Suspense fallback={<div className="h-5 w-24 rounded-full bg-muted" aria-hidden="true" />}>
            <TermPill />
          </Suspense>
        </div>

        <div className="order-last flex w-full justify-center md:order-none md:w-auto md:flex-1">
          <PillNav />
        </div>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Button asChild variant="ghost" size="icon" aria-label="Settings">
            <Link href="/settings">
              <SettingsIcon aria-hidden="true" />
            </Link>
          </Button>
          <ThemeToggle />
          <form action={signOut}>
            <Button type="submit" variant="destructive" size="icon" aria-label="Sign out">
              <LogOutIcon aria-hidden="true" />
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      {modal}
    </div>
  )
}
