import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Unit tests.
 *
 * Covers the pure logic CLAUDE.md section 10 requires: validation, import
 * parsing and duplicate detection. Anything needing a database is an RLS or
 * integration test and belongs in supabase/tests.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),

      // The `server-only` package throws on import outside a bundler, by
      // design. Under Vitest there is no bundler to have stripped it, so it is
      // aliased to an empty module: the guard stays real in the Next build
      // while remaining testable here. Nothing in these tests runs in a
      // browser, so the guard has no job to do.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
})