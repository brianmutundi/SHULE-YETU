import Link from 'next/link'
import { getSessionContext } from '@/lib/auth/session'
import { signOut } from '@/features/onboarding/actions'
import { PillNav } from './pill-nav'
import { ThemeToggle } from './theme-toggle'
import { SessionBadge } from './session-badge'

// Resolves the session from cookies, so this layout cannot be prerendered.
// Required on the layout as well as each page under Cache Components.
export const instant = false

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext()

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/home" className="font-semibold tracking-tight">
            {session.tenantName}
          </Link>

          <SessionBadge
            schoolTypeLabel={session.schoolTypeDefinition.label}
            mode={session.operatingMode}
          />

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md px-3 py-1.5 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

        <div className="mx-auto w-full max-w-7xl px-4 pb-2">
          <PillNav mode={session.operatingMode} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </div>
  )
}