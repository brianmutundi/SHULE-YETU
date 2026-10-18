'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { updateStudentBio } from '../record-actions'
import { RecordField, RecordSelect, RecordValue } from './record-field'
import { KENYA_COUNTIES } from '@/lib/kenya-counties'
import type { StudentRecord } from '../record-queries'
import type { RecordActionResult } from '../record-actions'

const STATUSES = [
  ['active', 'Active'],
  ['inactive', 'Inactive'],
  ['graduated', 'Graduated'],
  ['completed', 'Completed'],
  ['transferred', 'Transferred'],
  ['withdrawn', 'Withdrawn'],
] as const

const ORPHAN_STATUSES = [
  ['none', 'Both parents alive'],
  ['one_parent_deceased', 'One parent deceased'],
  ['both_deceased', 'Both parents deceased'],
  ['unknown', 'Unknown'],
] as const

const GENDERS = [
  ['female', 'Female'],
  ['male', 'Male'],
] as const

/** Submit button that reflects the form's own pending state. */
function SaveBar({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving...' : children}
    </Button>
  )
}

/**
 * Bio and Admission (section 7.7).
 *
 * Edit is inline and explicit rather than a separate page: a registrar updating
 * a phone number should not lose their place in the record.
 */
export function BioTab({ student, canEdit }: { student: StudentRecord; canEdit: boolean }) {
  const [editing, setEditing] = useState(false)
  const [state, formAction] = useActionState<RecordActionResult | null, FormData>(
    updateStudentBio,
    null,
  )

  if (!editing) {
    return (
      <div className="space-y-6">
        <section>
          <h3 className="mb-3 text-sm font-semibold">Identity</h3>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
            <RecordValue label="First name" value={student.firstName} />
            <RecordValue label="Other names" value={student.otherNames} />
            <RecordValue label="Surname" value={student.surname} />
            <RecordValue label="Gender" value={<span className="capitalize">{student.gender}</span>} />
            <RecordValue label="Date of birth" value={student.dateOfBirth} />
            <RecordValue label="Nationality" value={student.nationality} />
            <RecordValue label="Status" value={<span className="capitalize">{student.status}</span>} />
            <RecordValue label="UPI" value={student.upi} />
            <RecordValue label="Birth certificate" value={student.birthCertNo} />
          </dl>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold">Contact and residence</h3>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
            <RecordValue label="County" value={student.county} />
            <RecordValue label="Sub-county" value={student.subCounty} />
            <RecordValue label="Address" value={student.address} />
            <RecordValue label="Phone" value={student.phone} />
            <RecordValue label="Email" value={student.email} />
          </dl>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold">Admission</h3>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
            <RecordValue
              label="Admission number"
              value={<span className="font-mono">{student.studentNo}</span>}
            />
            <RecordValue label="Admitted on" value={student.admittedOn} />
            <RecordValue label="Class admitted" value={student.classLabel} />
            <RecordValue label="Current stream" value={student.streamLabel} />
            <RecordValue label="Previous school" value={student.previousSchool} />
            <RecordValue
              label="Tuition waiver"
              value={student.tuitionWaiver ? 'Granted' : 'Not granted'}
            />
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            The admission number cannot be changed. It identifies this learner in KNEC reporting.
          </p>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold">Vulnerability</h3>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
            <RecordValue
              label="Orphan status"
              value={<span className="capitalize">{student.orphanStatus.replace(/_/g, ' ')}</span>}
            />
          </dl>
        </section>

        {canEdit && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit student record
          </Button>
        )}
      </div>
    )
  }

  const errors = state && !state.ok ? state.fieldErrors : undefined

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="studentId" value={student.id} />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Identity</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <RecordField name="firstName" label="First name" defaultValue={student.firstName} required error={errors?.firstName?.[0]} />
          <RecordField name="otherNames" label="Other names" defaultValue={student.otherNames} error={errors?.otherNames?.[0]} />
          <RecordField name="surname" label="Surname" defaultValue={student.surname} error={errors?.surname?.[0]} />
          <RecordField label="Gender" required error={errors?.gender?.[0]}>
            <RecordSelect name="gender" defaultValue={student.gender} options={GENDERS} />
          </RecordField>
          <RecordField name="dateOfBirth" label="Date of birth" type="date" defaultValue={student.dateOfBirth} required error={errors?.dateOfBirth?.[0]} />
          <RecordField name="nationality" label="Nationality" defaultValue={student.nationality} error={errors?.nationality?.[0]} />
          <RecordField label="Status" required error={errors?.status?.[0]}>
            <RecordSelect name="status" defaultValue={student.status} options={STATUSES} />
          </RecordField>
          <RecordField name="upi" label="UPI" defaultValue={student.upi} error={errors?.upi?.[0]} />
          <RecordField name="birthCertNo" label="Birth certificate no." defaultValue={student.birthCertNo} error={errors?.birthCertNo?.[0]} />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Contact and residence</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <RecordField label="County" required error={errors?.county?.[0]}>
            <RecordSelect
              name="county"
              defaultValue={student.county}
              options={KENYA_COUNTIES.map((c) => [c, c] as const)}
            />
          </RecordField>
          <RecordField name="subCounty" label="Sub-county" defaultValue={student.subCounty} required error={errors?.subCounty?.[0]} />
          <RecordField name="address" label="Address" defaultValue={student.address} error={errors?.address?.[0]} />
          <RecordField name="phone" label="Phone" defaultValue={student.phone} placeholder="07XX XXX XXX" error={errors?.phone?.[0]} />
          <RecordField name="email" label="Email" defaultValue={student.email} error={errors?.email?.[0]} />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Admission</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <RecordField label="Class and stream">
            <RecordSelect
              name="streamId"
              defaultValue={student.streamId}
              blank="Unassigned"
              options={student.streams.map((s) => [s.id, `${s.classLabel} ${s.label}`.trim()] as const)}
            />
          </RecordField>
          <RecordField name="previousSchool" label="Previous school" defaultValue={student.previousSchool} error={errors?.previousSchool?.[0]} />
          <RecordField name="transferReason" label="Transfer reason" defaultValue={student.transferReason} error={errors?.transferReason?.[0]} />
          <div className="flex items-center gap-2 sm:col-span-3">
            <input
              type="checkbox"
              id="tuitionWaiver"
              name="tuitionWaiver"
              value="true"
              defaultChecked={student.tuitionWaiver}
              className="size-4"
            />
            <Label htmlFor="tuitionWaiver" className="text-sm">
              Tuition waiver granted
            </Label>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          The admission number {student.studentNo} is fixed and is not editable.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Vulnerability</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <RecordField label="Orphan status">
            <RecordSelect name="orphanStatus" defaultValue={student.orphanStatus} options={ORPHAN_STATUSES} />
          </RecordField>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <SaveBar>Save changes</SaveBar>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <span aria-live="polite" className="text-sm">
          {state?.ok && <span className="text-muted-foreground">Saved.</span>}
          {state && !state.ok && <span className="text-destructive">{state.error}</span>}
        </span>
      </div>
    </form>
  )
}

/** Compact link back to the directory, used by the record header. */
export function BackToDirectory() {
  return (
    <Link href="/students" className="text-sm text-muted-foreground hover:text-foreground">
      Back to learners
    </Link>
  )
}

/** Status pill shared with the record header. */
export function StatusBadge({ status }: { status: StudentRecord['status'] }) {
  return (
    <Badge variant={status === 'active' ? 'default' : 'secondary'} className="capitalize">
      {status}
    </Badge>
  )
}