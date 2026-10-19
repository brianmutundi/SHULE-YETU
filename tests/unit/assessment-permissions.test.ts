import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ALL_ROLES, can, type Permission } from '@/lib/auth/permissions'

const migration = readFileSync(
  'supabase/migrations/20261018004200_enforce_assessment_roles.sql',
  'utf8',
)

/** The role list a function passes to app.has_role(). */
function sqlRoles(functionName: string): string[] {
  const start = migration.indexOf(`create or replace function app.${functionName}(`)
  expect(start, `${functionName} should exist in 0042`).toBeGreaterThanOrEqual(0)
  const body = migration.slice(start, migration.indexOf('$$;', start + 200))
  const match = /app\.has_role\(([^)]*)\)/.exec(body)
  expect(match, `${functionName} should call app.has_role()`).not.toBeNull()
  return [...match![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
}

/** Every role the TypeScript map grants to a permission. */
function tsRoles(permission: Permission): string[] {
  const roles: string[] = []
  for (const role of ALL_ROLES) {
    if (can(role, permission)) roles.push(role)
  }
  return roles.sort()
}

// The SQL in 0042 and the map in src/lib/auth/permissions.ts must agree. 0043
// then narrows report cards to the caller's assigned class, but it does not
// change which roles may issue one.
describe('assessment permissions match the database', () => {
  it('grants marks.record to exactly the roles app.can_record_marks() names', () => {
    expect(tsRoles('marks.record')).toEqual(sqlRoles('can_record_marks'))
  })

  it('grants report_card.issue to exactly the roles app.can_issue_report_cards() names', () => {
    expect(tsRoles('report_card.issue')).toEqual(sqlRoles('can_issue_report_cards'))
  })
})

describe('assessment permissions', () => {
  it('lets class teachers and above issue report cards', () => {
    for (const role of ['owner', 'admin', 'head_teacher', 'deputy_head', 'class_teacher'] as const) {
      expect(can(role, 'report_card.issue')).toBe(true)
    }
  })

  it('does not let other teachers or read-only roles issue report cards', () => {
    for (const role of ['teacher', 'subject_teacher', 'registrar', 'viewer', 'parent'] as const) {
      expect(can(role, 'report_card.issue')).toBe(false)
    }
  })

  it('does not let viewers or parents record marks', () => {
    expect(can('viewer', 'marks.record')).toBe(false)
    expect(can('parent', 'marks.record')).toBe(false)
  })

  it('lets teaching roles record marks', () => {
    for (const role of ['teacher', 'class_teacher', 'subject_teacher'] as const) {
      expect(can(role, 'marks.record')).toBe(true)
    }
  })
})
