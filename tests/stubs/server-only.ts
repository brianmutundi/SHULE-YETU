/**
 * Test stub for the `server-only` package.
 *
 * `server-only` throws when imported outside a bundler, which is what makes it
 * useful in the Next build. Vitest is not a bundler, so the real module cannot
 * be loaded at all. This stub is aliased in vitest.config.ts and exists only so
 * server modules can be imported by unit tests.
 *
 * The guard is NOT weakened in the application: next.config and the real
 * package still apply during `next build`.
 */
export {}