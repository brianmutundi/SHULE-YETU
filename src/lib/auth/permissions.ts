import type { Database } from '@/lib/supabase/types'

export type app_role = Database['public']['Enums']['app_role']
/** Alias for code that prefers a conventional casing. */
export type AppRole = app_role

/**
 * Role permissions.
 *
 * RLS is the source of truth. This matrix exists so server actions can fail
 * fast with a clear message instead of issuing a query that silently returns
 * nothing. A permission granted here that RLS does not enforce is a bug; an
 * action that relies on this alone, without RLS, is also a bug.
 *
 * Both must agree. RLS tests (per role) are the proof.
 */

export type Permission =
  | 'school.manage' // edit school profile, school type is separately blocked
  | 'staff.manage' // add, edit, soft-delete staff
  | 'staff.view_sensitive' // KRA PIN, NSSF/SHA, national ID
  | 'student.enrol'
  | 'student.edit'
  | 'student.view'
  | 'guardian.manage'
  | 'attendance.mark'
  | 'attendance.view'
  | 'marks.record'
  | 'report_card.issue'
  | 'exam_record' // KPSEA / KJSEA checkpoints
  | 'fee.view'
  | 'fee.record'
  | 'fee.reverse'
  | 'fee.structure_manage'
  | 'bursary.manage'
  | 'promotion.run'
  | 'promotion.rollback'
  | 'session.manage' // terms and academic years
  | 'boarding.manage'
  | 'messaging.send'
  | 'audit.view'

type RolePermissions = readonly Permission[]

const PERMISSIONS: Record<app_role, RolePermissions> = {
  owner: [
    'school.manage',
    'staff.manage',
    'staff.view_sensitive',
    'student.enrol',
    'student.edit',
    'student.view',
    'guardian.manage',
    'attendance.mark',
    'attendance.view',
    'marks.record',
    'report_card.issue',
    'exam_record',
    'fee.view',
    'fee.record',
    'fee.reverse',
    'fee.structure_manage',
    'bursary.manage',
    'promotion.run',
    'promotion.rollback',
    'session.manage',
    'boarding.manage',
    'messaging.send',
    'audit.view',
  ],

  admin: [
    'school.manage',
    'staff.manage',
    'staff.view_sensitive',
    'student.enrol',
    'student.edit',
    'student.view',
    'guardian.manage',
    'attendance.mark',
    'attendance.view',
    'marks.record',
    'report_card.issue',
    'exam_record',
    'fee.view',
    'fee.record',
    'fee.structure_manage',
    'bursary.manage',
    'promotion.run',
    'session.manage',
    'boarding.manage',
    'messaging.send',
    'audit.view',
  ],

  head_teacher: [
    'staff.manage',
    'student.enrol',
    'student.edit',
    'student.view',
    'guardian.manage',
    'attendance.mark',
    'attendance.view',
    'marks.record',
    'report_card.issue',
    'exam_record',
    'fee.view',
    'promotion.run',
    'session.manage',
    'messaging.send',
    'audit.view',
  ],

  deputy_head: [
    'student.enrol',
    'student.edit',
    'student.view',
    'guardian.manage',
    'attendance.mark',
    'attendance.view',
    'marks.record',
    'report_card.issue',
    'exam_record',
    'fee.view',
    'messaging.send',
  ],

  registrar: [
    'student.enrol',
    'student.edit',
    'student.view',
    'guardian.manage',
    'attendance.view',
    'messaging.send',
  ],

  teacher: ['student.view', 'attendance.mark', 'attendance.view', 'marks.record'],

  class_teacher: [
    'student.view',
    'guardian.manage',
    'attendance.mark',
    'attendance.view',
    'marks.record',
  ],

  subject_teacher: ['student.view', 'attendance.mark', 'attendance.view', 'marks.record'],

  finance: [
    'staff.view_sensitive',
    'student.view',
    'fee.view',
    'fee.record',
    'fee.reverse',
    'fee.structure_manage',
    'bursary.manage',
    'messaging.send',
  ],

  // bursar is the day-to-day finance role and maps to the same capabilities.
  bursar: [
    'staff.view_sensitive',
    'student.view',
    'fee.view',
    'fee.record',
    'fee.structure_manage',
    'messaging.send',
  ],

  viewer: ['student.view', 'attendance.view'],

  // Read-only parent portal. Arrives in a later phase.
  parent: ['student.view', 'attendance.view'],
}

/** Roles allowed to see KRA PIN, NSSF/SHA and national ID. Mirrors RLS. */
export const SENSITIVE_FINANCE_ROLES = ['owner', 'admin', 'finance', 'bursar'] as const

export function can(role: app_role, permission: Permission): boolean {
  return PERMISSIONS[role].includes(permission)
}

export function canAny(role: app_role, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => can(role, permission))
}

export function canAll(role: app_role, permissions: readonly Permission[]): boolean {
  return permissions.every((permission) => can(role, permission))
}

/** Roles that may change another person's role. Mirrors the profiles guard. */
export function canAssignRoles(role: app_role): boolean {
  return role === 'owner' || role === 'admin'
}

export function canViewSensitiveFinance(role: app_role): boolean {
  return (SENSITIVE_FINANCE_ROLES as readonly string[]).includes(role)
}

export function permissionsFor(role: app_role): readonly Permission[] {
  return PERMISSIONS[role]
}

export const ALL_ROLES = Object.keys(PERMISSIONS) as app_role[]