'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { saveStaff, softDeleteStaff } from '../actions'
import {
  EMPLOYER_LABELS,
  EMPLOYERS,
  GENDERS,
  STAFF_STATUS_LABELS,
  STAFF_STATUSES,
  STAFF_TYPES,
  STAFF_TYPE_LABELS,
  type StaffActionResult,
  type StaffFormResult,
} from '../schema'
import type { StaffRow } from '../queries'

/**
 * Staff directory (CLAUDE.md section 7.12).
 *
 * The KRA PIN and NSSF/SHA fields only render for a role the database already
 * permits. That is a courtesy, not the control: app.can_view_sensitive_finance()
 * nulls the values in SQL, so hiding the inputs here cannot be mistaken for
 * access control.
 */

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

function StaffForm({ staff, canSeeSensitive }: { staff?: StaffRow; canSeeSensitive: boolean }) {
  const [state, action] = useActionState<StaffActionResult | null, FormData>(saveStaff, null)

  return (
    <form action={action} className="space-y-3">
      {staff && <input type="hidden" name="id" value={staff.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="fullName" className="text-xs text-muted-foreground">
            Full name *
          </label>
          <input
            id="fullName"
            name="fullName"
            defaultValue={staff?.fullName}
            required
            className="h-8 w-full rounded-md border border-border bg-transparent px-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="gender" className="text-xs text-muted-foreground">
            Gender
          </label>
          <select
            id="gender"
            name="gender"
            defaultValue={staff?.gender ?? ''}
            className="h-8 w-full rounded-md border border-border bg-transparent px-2 text-sm"
          >
            <option value="">Not stated</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {g === 'male' ? 'Male' : 'Female'}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="staffType" className="text-xs text-muted-foreground">
            Staff type *
          </label>
          <select
            id="staffType"
            name="staffType"
            defaultValue={staff?.staffType ?? 'teaching'}
            className="h-8 w-full rounded-md border border-border bg-transparent px-2 text-sm"
          >
            {STAFF_TYPES.map((t) => (
              <option key={t} value={t}>
                {STAFF_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="employer" className="text-xs text-muted-foreground">
            Employer *
          </label>
          <select
            id="employer"
            name="employer"
            defaultValue={staff?.employer ?? 'private'}
            className="h-8 w-full rounded-md border border-border bg-transparent px-2 text-sm"
          >
            {EMPLOYERS.map((e) => (
              <option key={e} value={e}>
                {EMPLOYER_LABELS[e]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="tscNumber" className="text-xs text-muted-foreground">
            TSC number
          </label>
          <input
            id="tscNumber"
            name="tscNumber"
            defaultValue={staff?.tscNumber ?? ''}
            className="h-8 w-full rounded-md border border-border bg-transparent px-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="status" className="text-xs text-muted-foreground">
            Status *
          </label>
          <select
            id="status"
            name="status"
            defaultValue={staff?.status ?? 'active'}
            className="h-8 w-full rounded-md border border-border bg-transparent px-2 text-sm"
          >
            {STAFF_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STAFF_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="phone" className="text-xs text-muted-foreground">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={staff?.phone ?? ''}
            className="h-8 w-full rounded-md border border-border bg-transparent px-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="text-xs text-muted-foreground">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={staff?.email ?? ''}
            className="h-8 w-full rounded-md border border-border bg-transparent px-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="employmentType" className="text-xs text-muted-foreground">
            Employment type
          </label>
          <input
            id="employmentType"
            name="employmentType"
            defaultValue={staff?.employmentType ?? ''}
            placeholder="Permanent, contract, casual"
            className="h-8 w-full rounded-md border border-border bg-transparent px-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="hiredOn" className="text-xs text-muted-foreground">
            Hired on
          </label>
          <input
            id="hiredOn"
            name="hiredOn"
            type="date"
            defaultValue={staff?.hiredOn ?? ''}
            className="h-8 w-full rounded-md border border-border bg-transparent px-2 text-sm"
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="address" className="text-xs text-muted-foreground">
            Address
          </label>
          <input
            id="address"
            name="address"
            defaultValue={staff?.address ?? ''}
            className="h-8 w-full rounded-md border border-border bg-transparent px-2 text-sm"
          />
        </div>
      </div>

      {canSeeSensitive && (
        <fieldset className="space-y-3 rounded-md border border-border p-3">
          <legend className="px-1 text-xs font-medium">Payroll identifiers</legend>
          <p className="text-xs text-muted-foreground">
            Visible to school administrators, finance staff and bursars only.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="kraPin" className="text-xs text-muted-foreground">
                KRA PIN
              </label>
              <input
                id="kraPin"
                name="kraPin"
                defaultValue={staff?.kraPin ?? ''}
                className="h-8 w-full rounded-md border border-border bg-transparent px-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="nssfShaNumber" className="text-xs text-muted-foreground">
                NSSF/SHA number
              </label>
              <input
                id="nssfShaNumber"
                name="nssfShaNumber"
                defaultValue={staff?.nssfShaNumber ?? ''}
                className="h-8 w-full rounded-md border border-border bg-transparent px-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="nationalId" className="text-xs text-muted-foreground">
                National ID
              </label>
              <input
                id="nationalId"
                name="nationalId"
                defaultValue={staff?.nationalId ?? ''}
                className="h-8 w-full rounded-md border border-border bg-transparent px-2 text-sm"
              />
            </div>
          </div>
        </fieldset>
      )}

      <Submit label={staff ? 'Save changes' : 'Add staff member'} pendingLabel="Saving..." />

      <p aria-live="polite" className="text-sm">
        {state?.ok && <span className="text-muted-foreground">Saved.</span>}
        {state && !state.ok && <span className="text-destructive">{state.error}</span>}
      </p>
    </form>
  )
}

function DeleteButton({ staff }: { staff: StaffRow }) {
  const [state, action] = useActionState<StaffFormResult | null, FormData>(softDeleteStaff, null)
  const { pending } = useFormStatus()

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="staffId" value={staff.id} />
      <Button type="submit" size="xs" variant="ghost" disabled={pending}>
        Remove
      </Button>
      {state && !state.ok && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  )
}

export function StaffDirectoryView({
  rows,
  stats,
  canSeeSensitive,
  canManage,
  filters,
}: {
  rows: StaffRow[]
  stats: {
    total: number
    teaching: number
    nonTeaching: number
    admin: number
    bom: number
    tsc: number
    active: number
  }
  canSeeSensitive: boolean
  canManage: boolean
  filters: { search: string; staffType: string; employer: string; status: string }
}) {
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<StaffRow | null>(null)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Teaching" value={stats.teaching} />
        <StatCard label="Non-teaching" value={stats.nonTeaching} />
        <StatCard label="Administration" value={stats.admin} />
        <StatCard label="BOM" value={stats.bom} />
        <StatCard label="Active" value={stats.active} />
      </div>

      <form method="get" action="/staff" className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="search" className="text-xs text-muted-foreground">
            Search
          </label>
          <input
            id="search"
            name="search"
            type="search"
            defaultValue={filters.search}
            placeholder="Name"
            className="h-8 w-56 rounded-md border border-border bg-transparent px-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="staffType" className="text-xs text-muted-foreground">
            Staff type
          </label>
          <select
            id="staffType"
            name="staffType"
            defaultValue={filters.staffType}
            className="h-8 rounded-md border border-border bg-transparent px-2 text-sm"
          >
            <option value="all">All types</option>
            {STAFF_TYPES.map((t) => (
              <option key={t} value={t}>
                {STAFF_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="employer" className="text-xs text-muted-foreground">
            Employer
          </label>
          <select
            id="employer"
            name="employer"
            defaultValue={filters.employer}
            className="h-8 rounded-md border border-border bg-transparent px-2 text-sm"
          >
            <option value="all">All employers</option>
            {EMPLOYERS.map((e) => (
              <option key={e} value={e}>
                {EMPLOYER_LABELS[e]}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="h-8 rounded-md bg-primary px-3 text-sm text-primary-foreground"
        >
          Apply
        </button>
      </form>

      {canManage && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Cancel' : 'Add a staff member'}
          </Button>
        </div>
      )}

      {adding && (
        <Card>
          <CardHeader>
            <CardTitle>New staff member</CardTitle>
          </CardHeader>
          <CardContent>
            <StaffForm canSeeSensitive={canSeeSensitive} />
          </CardContent>
        </Card>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">Staff directory</caption>
          <thead className="border-b border-border bg-surface-2 text-left">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Name</th>
              <th scope="col" className="px-4 py-2 font-medium">Type</th>
              <th scope="col" className="px-4 py-2 font-medium">Employer</th>
              <th scope="col" className="px-4 py-2 font-medium">TSC no.</th>
              <th scope="col" className="px-4 py-2 font-medium">Teaching</th>
              <th scope="col" className="px-4 py-2 font-medium">Status</th>
              <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No staff match these filters.
                </td>
              </tr>
            ) : (
              rows.map((member) => (
                <tr key={member.id}>
                  <td className="px-4 py-2 font-medium">{member.fullName}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {STAFF_TYPE_LABELS[member.staffType]}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {member.employer === 'tsc'
                      ? 'TSC'
                      : member.employer === 'bom'
                        ? 'BOM'
                        : 'Private'}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{member.tscNumber ?? '-'}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {member.assignments.length === 0
                      ? '-'
                      : member.assignments.map((a) =>
                          a.scope === 'class_teacher'
                            ? `Class teacher, ${a.classLabel ?? ''} ${a.streamLabel ?? ''}`
                            : a.subjectCode ?? a.learningArea ?? 'Subject teacher',
                        ).join('; ')}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={member.status === 'active' ? 'default' : 'outline'}>
                      {STAFF_STATUS_LABELS[member.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      {canManage && (
                        <>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => setSelected(selected?.id === member.id ? null : member)}
                          >
                            {selected?.id === member.id ? 'Close' : 'Edit'}
                          </Button>
                          <DeleteButton staff={member} />
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>Edit {selected.fullName}</CardTitle>
          </CardHeader>
          <CardContent>
            <StaffForm staff={selected} canSeeSensitive={canSeeSensitive} />
          </CardContent>
        </Card>
      )}

      {!canSeeSensitive && (
        <Alert>
          <AlertTitle>Payroll identifiers are hidden</AlertTitle>
          <AlertDescription>
            KRA PIN, NSSF/SHA numbers and national IDs are visible to school administrators,
            finance staff and bursars only.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}