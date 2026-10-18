import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { can, type AppRole } from '@/lib/auth/permissions'
import { formatMoney, MAX_PAYMENT_MINOR, parseMoneyToMinor } from '@/features/fees/money'
import {
  canBeReversed,
  entryKind,
  recordPaymentSchema,
  RECEIPT_NO_PATTERN,
  referenceRequired,
  reversePaymentSchema,
} from '@/features/fees/schema'

const STUDENT = '8c1d3a3e-5f0b-4a54-9d3f-1b2c3d4e5f60'
const migration = readFileSync('supabase/migrations/20261018010100_fees.sql', 'utf8')

describe('money', () => {
  it('formats KES minor units with grouping and two decimals', () => {
    expect(formatMoney(1250000)).toBe('KES 12,500.00')
    expect(formatMoney(5)).toBe('KES 0.05')
    expect(formatMoney(0)).toBe('KES 0.00')
    expect(formatMoney(123456789)).toBe('KES 1,234,567.89')
  })

  it('prints a reversal entry as a negative amount', () => {
    expect(formatMoney(-50000)).toBe('-KES 500.00')
  })

  it('parses what a registrar types into integer minor units, with no float error', () => {
    expect(parseMoneyToMinor('12500')).toBe(1250000)
    expect(parseMoneyToMinor('12,500.5')).toBe(1250050)
    expect(parseMoneyToMinor('KES 0.07')).toBe(7)
    expect(parseMoneyToMinor('19.99')).toBe(1999)
    expect(parseMoneyToMinor('0.29')).toBe(29)
  })

  it('rejects negatives, three decimals, text and empty input', () => {
    for (const bad of ['', '-5', '1.234', 'abc', '12.', '.5', '1e3']) {
      expect(parseMoneyToMinor(bad)).toBeNull()
    }
  })
})

describe('record payment schema', () => {
  const base = { studentId: STUDENT, amount: '12,500', method: 'cash' }

  it('turns the typed amount into minor units', () => {
    expect(recordPaymentSchema.parse(base).amount).toBe(1250000)
  })

  it('refuses zero, negative and absurd amounts', () => {
    expect(() => recordPaymentSchema.parse({ ...base, amount: '0' })).toThrow()
    expect(() => recordPaymentSchema.parse({ ...base, amount: '-100' })).toThrow()
    expect(MAX_PAYMENT_MINOR).toBe(1_000_000_000)
    expect(() => recordPaymentSchema.parse({ ...base, amount: '10000000.01' })).toThrow()
  })

  it('requires a reference for M-Pesa, bank and cheque but not cash, bursary or sponsor', () => {
    for (const method of ['mpesa', 'bank', 'cheque']) {
      expect(referenceRequired(method as never)).toBe(true)
      expect(() => recordPaymentSchema.parse({ ...base, method })).toThrow()
      expect(recordPaymentSchema.parse({ ...base, method, reference: 'QGH7XYZ123' }).reference).toBe(
        'QGH7XYZ123',
      )
    }
    for (const method of ['cash', 'bursary', 'sponsor']) {
      expect(() => recordPaymentSchema.parse({ ...base, method })).not.toThrow()
    }
  })

  it('refuses an unknown method and a malformed date', () => {
    expect(() => recordPaymentSchema.parse({ ...base, method: 'crypto' })).toThrow()
    expect(() => recordPaymentSchema.parse({ ...base, paidOn: '19/10/2026' })).toThrow()
  })
})

describe('reversals', () => {
  it('badges the negative entry as a reversal and the original as reversed', () => {
    expect(entryKind({ status: 'posted', reversesPaymentId: null })).toBe('payment')
    expect(entryKind({ status: 'reversed', reversesPaymentId: null })).toBe('reversed')
    expect(entryKind({ status: 'posted', reversesPaymentId: 'abc' })).toBe('reversal')
  })

  it('lets only an unreversed original be reversed', () => {
    expect(canBeReversed({ status: 'posted', reversesPaymentId: null })).toBe(true)
    expect(canBeReversed({ status: 'reversed', reversesPaymentId: null })).toBe(false)
    expect(canBeReversed({ status: 'posted', reversesPaymentId: 'abc' })).toBe(false)
  })

  it('needs a reason of at least three characters', () => {
    expect(() => reversePaymentSchema.parse({ paymentId: STUDENT, reason: 'no' })).toThrow()
    expect(reversePaymentSchema.parse({ paymentId: STUDENT, reason: ' Wrong learner ' }).reason).toBe(
      'Wrong learner',
    )
  })
})

describe('receipt numbers', () => {
  it('matches RCP-YY-NNNNNN', () => {
    expect(RECEIPT_NO_PATTERN.test('RCP-26-000001')).toBe(true)
    expect(RECEIPT_NO_PATTERN.test('RCP-26-1')).toBe(false)
    expect(RECEIPT_NO_PATTERN.test('RCP-2026-000001')).toBe(false)
  })

  it('is built in SQL with the same shape: RCP, two-digit year, six-digit counter', () => {
    expect(migration).toContain("'RCP-' || lpad((v_year % 100)::text, 2, '0') || '-' || lpad(v_n::text, 6, '0')")
  })

  it('allocates the counter with one atomic upsert, not a read then a write', () => {
    expect(migration).toMatch(/on conflict \(tenant_id, year\)\s+do update set last_value = public\.receipt_counters\.last_value \+ 1\s+returning last_value into v_n/)
  })
})

/** The role list SQL passes to app.has_role() inside the named function. */
function sqlRoles(functionName: string): string[] {
  const start = migration.indexOf(`create or replace function app.${functionName}(`)
  expect(start).toBeGreaterThanOrEqual(0)
  const body = migration.slice(start, migration.indexOf('$$;', start + 200))
  const match = /app\.has_role\(([^)]*)\)/.exec(body)
  expect(match).not.toBeNull()
  return [...match![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
}

const ALL_ROLES: AppRole[] = [
  'owner', 'admin', 'registrar', 'teacher', 'finance', 'viewer', 'head_teacher',
  'deputy_head', 'bursar', 'class_teacher', 'subject_teacher', 'parent',
]

describe('SQL and TypeScript agree on who may handle money', () => {
  it('record_payment allows exactly the roles with fee.record', () => {
    const ts = ALL_ROLES.filter((r) => can(r, 'fee.record')).sort()
    expect(sqlRoles('record_payment')).toEqual(ts)
  })

  it('reverse_payment allows exactly the roles with fee.reverse', () => {
    const ts = ALL_ROLES.filter((r) => can(r, 'fee.reverse')).sort()
    expect(sqlRoles('reverse_payment')).toEqual(ts)
  })

  it('generate_invoice allows exactly the roles with fee.structure_manage', () => {
    const ts = ALL_ROLES.filter((r) => can(r, 'fee.structure_manage')).sort()
    expect(sqlRoles('generate_invoice')).toEqual(ts)
  })

  it('receipt and statement reads allow exactly the roles with fee.view', () => {
    const ts = ALL_ROLES.filter((r) => can(r, 'fee.view')).sort()
    expect(sqlRoles('payment_receipt')).toEqual(ts)
    expect(sqlRoles('fee_statement')).toEqual(ts)
  })
})

describe('database guarantees written into the migration', () => {
  it('makes payments immutable except the reversal marking', () => {
    expect(migration).toContain('Payments cannot be deleted')
    expect(migration).toContain('Payments cannot be edited')
    expect(migration).toContain("old.status = 'posted'")
    expect(migration).toContain("new.status = 'reversed'")
  })

  it('allows one reversal per payment and requires the sign to match the link', () => {
    expect(migration).toContain('payments_one_reversal_idx')
    expect(migration).toContain('(reverses_payment_id is null and amount > 0)')
    expect(migration).toContain('(reverses_payment_id is not null and amount < 0)')
  })

  it('creates the balance view with security_invoker so RLS applies', () => {
    expect(migration).toMatch(/create view public\.student_balances\s+with \(security_invoker = true\)/)
  })

  it('enables RLS on every fee table and gives the written ones no direct write policy', () => {
    for (const table of ['fee_structures', 'fee_items', 'invoices', 'invoice_lines', 'payments', 'receipt_counters']) {
      expect(migration).toContain(`alter table public.${table}`)
    }
    expect(migration).not.toMatch(/create policy \w+ on public\.payments for (insert|update|delete|all)/)
    expect(migration).not.toMatch(/create policy \w+ on public\.invoices for (insert|update|delete|all)/)
  })
})
