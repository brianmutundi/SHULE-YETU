import type { ActionResult } from '@/features/onboarding/actions'
import { getSessionContext, type SessionContext } from './session'
import { can, canAssignRoles, canViewSensitiveFinance, type Permission } from './permissions'

/**
 * Guard for server actions.
 *
 * Enforces the CLAUDE.md section 4 order: authenticate, authorize, then the
 * caller validates with Zod and queries. Throwing is correct here - these are
 * programming errors, not expected failures - but callers that can genuinely
 * fail should catch and return `{ ok: false, error }`.
 */
export async function requirePermission(
  permission: Permission,
): Promise<SessionContext & { allowed: true }> {
  const session = await getSessionContext()

  if (!can(session.role, permission)) {
    throw new Error(`Role "${session.role}" is not permitted to ${permission}.`)
  }

  return { ...session, allowed: true }
}

/**
 * Authorize without throwing. Use where a permission gates an optional part
 * of a response rather than the whole action.
 */
export async function hasPermission(permission: Permission): Promise<boolean> {
  const session = await getSessionContext()
  return can(session.role, permission)
}

export async function requireRoleAssignment(): Promise<SessionContext & { allowed: true }> {
  const session = await getSessionContext()

  if (!canAssignRoles(session.role)) {
    throw new Error(`Role "${session.role}" cannot assign roles.`)
  }

  return { ...session, allowed: true }
}

export { canViewSensitiveFinance }

/** Redact values a role must not see. Used before any response or log line. */
export function redactSensitive<T extends Record<string, unknown>>(
  role: SessionContext['role'],
  row: T,
): T {
  if (canViewSensitiveFinance(role)) return row

  const redacted: Record<string, unknown> = { ...row }
  for (const key of ['kra_pin', 'nssf_sha_number', 'national_id'] as const) {
    if (key in redacted) redacted[key] = null
  }
  return redacted as T
}

export type { ActionResult }