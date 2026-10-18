import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/app/globals.css', 'utf8')
const layout = readFileSync('src/app/layout.tsx', 'utf8')

function block(selector: string): string {
  const start = css.indexOf(selector)
  expect(start).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('\n}', start))
}

describe('design tokens', () => {
  it('does not define --font-sans in terms of itself', () => {
    expect(css).not.toMatch(/--font-sans:\s*var\(--font-sans\)/)
    expect(css).not.toMatch(/--font-heading:\s*var\(--font-heading\)/)
  })

  it('reads the Work Sans variable that next/font injects', () => {
    expect(layout).toContain("variable: '--font-work-sans'")
    expect(layout).toContain('workSans.variable')
    expect(css).toMatch(/--font-sans:\s*var\(--font-work-sans\)/)
  })

  it.each([':root {', '.dark {'])('defines every chip pair in %s', (selector) => {
    const body = block(selector)
    for (const tone of ['status', 'gender', 'class', 'relation', 'neutral', 'warning']) {
      expect(body).toContain(`--chip-${tone}:`)
      expect(body).toContain(`--chip-${tone}-foreground:`)
    }
  })
})
