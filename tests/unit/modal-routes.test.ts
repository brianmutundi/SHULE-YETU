import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const app = 'src/app/(app)'

describe('modal routes for Classes and Transitions', () => {
  it('has a default for the modal slot, without which a full page load fails to build', () => {
    expect(existsSync(`${app}/@modal/default.tsx`)).toBe(true)
  })

  it('intercepts /classes and /transitions and keeps the full pages for direct visits', () => {
    for (const name of ['classes', 'transitions']) {
      expect(existsSync(`${app}/@modal/(.)${name}/page.tsx`)).toBe(true)
      expect(existsSync(`${app}/${name}/page.tsx`)).toBe(true)
    }
  })

  it('falls back to the slot default on any other navigation', () => {
    // default.tsx is what clears the slot. It used to be paired with a
    // [...catchAll]/page.tsx doing the same job (returning null), but a
    // catch-all inside a parallel slot at the group root makes Next drop
    // sibling routes: /login and /register both 404, so a signed-out user
    // can never reach the sign-in form. Two files returning null is one too
    // many, and the catch-all was the one that broke routing.
    expect(existsSync(`${app}/@modal/default.tsx`)).toBe(true)
    expect(existsSync(`${app}/@modal/[...catchAll]/page.tsx`)).toBe(false)
  })

  it('renders the slot in the app layout', () => {
    const layout = readFileSync(`${app}/layout.tsx`, 'utf8')
    expect(layout).toContain('modal: React.ReactNode')
    expect(layout).toContain('{modal}')
  })

  it('shows the Classes table columns in the agreed order', () => {
    const table = readFileSync('src/features/classes/components/classes-manager.tsx', 'utf8')
    const headings = [...table.matchAll(/<th scope="col" className="px-4 py-2 font-medium">([^<]+)<\/th>/g)]
      .map((m) => m[1])
    expect(headings).toEqual(['Label', 'Stream', 'Full Name', 'Level', 'Year'])
  })
})
