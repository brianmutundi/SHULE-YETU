'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { quickCreateStudent } from '../actions'
import type { StudentActionResult } from '../actions'
import type { RegistrationOptions } from '../queries'

const selectClass =
  'h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving...' : 'Register learner'}
    </Button>
  )
}

function Field({
  id,
  label,
  error,
  required,
  children,
}: {
  id: string
  label: string
  error?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * Registration modal (section 7.6, quick registration).
 *
 * The six-step wizard at /students/new is the full path; this is the short
 * one a registrar uses at the gate. The admission number is allocated by the
 * database. The class derives from the stream in a trigger, so only the
 * stream is chosen here.
 */
export function QuickCreateStudent({ options }: { options: RegistrationOptions }) {
  const [state, action] = useActionState<StudentActionResult | null, FormData>(
    quickCreateStudent,
    null,
  )
  const [open, setOpen] = useState(false)
  // Remounts the form for "Register another" so every field resets.
  const [formKey, setFormKey] = useState(0)
  const [hasPhoto, setHasPhoto] = useState(false)

  const fieldError = (name: string) =>
    state && !state.ok ? state.fieldErrors?.[name]?.[0] : undefined

  const created = state?.ok ? state : null

  return (
    <>
      <Button onClick={() => setOpen(true)}>Register learner</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Register learner</DialogTitle>
            <DialogDescription>
              The admission number is allocated by the database and cannot be edited.
            </DialogDescription>
          </DialogHeader>

          {created ? (
            <div className="space-y-4">
              <Alert role="status">
                <AlertDescription>
                  {created.fullName ? <strong>{created.fullName}</strong> : 'Learner'} registered
                  with admission number <strong>{created.studentNo}</strong>.
                </AlertDescription>
              </Alert>
              {created.photoWarning && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{created.photoWarning}</AlertDescription>
                </Alert>
              )}
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setFormKey((k) => k + 1)
                    setHasPhoto(false)
                  }}
                >
                  Register another
                </Button>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form key={formKey} action={action} className="space-y-4" noValidate>
              {state && !state.ok && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{state.error}</AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="firstName" label="First name" required error={fieldError('firstName')}>
                  <Input id="firstName" name="firstName" required maxLength={80} />
                </Field>
                <Field id="otherNames" label="Other names" error={fieldError('otherNames')}>
                  <Input id="otherNames" name="otherNames" maxLength={120} />
                </Field>
                <Field id="surname" label="Surname" error={fieldError('surname')}>
                  <Input id="surname" name="surname" maxLength={80} />
                </Field>
                <Field id="gender" label="Gender" required error={fieldError('gender')}>
                  <select id="gender" name="gender" required className={selectClass}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </Field>
                <Field id="dateOfBirth" label="Date of birth" required error={fieldError('dateOfBirth')}>
                  <Input id="dateOfBirth" name="dateOfBirth" type="date" required />
                </Field>
                <Field id="nationality" label="Nationality" error={fieldError('nationality')}>
                  <Input id="nationality" name="nationality" defaultValue="Kenyan" maxLength={80} />
                </Field>
                <Field id="religion" label="Religion" error={fieldError('religion')}>
                  <Input id="religion" name="religion" maxLength={80} />
                </Field>
                <Field id="address" label="Address" error={fieldError('address')}>
                  <Input id="address" name="address" maxLength={200} />
                </Field>
                <Field id="status" label="Status">
                  <select id="status" name="status" defaultValue="active" className={selectClass}>
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </Field>
                <Field id="admittedOn" label="Admission date" error={fieldError('admittedOn')}>
                  <Input id="admittedOn" name="admittedOn" type="date" defaultValue={options.today} />
                </Field>
                <Field id="sessionId" label="Term">
                  <select
                    id="sessionId"
                    name="sessionId"
                    defaultValue={options.defaultTermId ?? ''}
                    className={selectClass}
                  >
                    <option value="">Not set</option>
                    {options.terms.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="streamId" label="Class">
                  <select id="streamId" name="streamId" className={selectClass}>
                    <option value="">Unassigned</option>
                    {options.streams.map((s) => {
                      const cls = options.classes.find((c) => c.id === s.classId)
                      return (
                        <option key={s.id} value={s.id}>
                          {cls ? `${cls.label} ${s.label}` : s.label}
                        </option>
                      )
                    })}
                  </select>
                </Field>
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="tuitionWaiver" className="size-4" />
                  Tuition waiver
                </label>

                <Field id="photo" label="Photo (JPEG, PNG or WebP, up to 2 MB)">
                  <Input
                    id="photo"
                    name="photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setHasPhoto(Boolean(e.target.files?.length))}
                  />
                </Field>

                {hasPhoto && (
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name="mediaConsent" className="mt-0.5 size-4" />
                    <span>
                      The guardian has consented to this photograph being kept. This is recorded
                      separately from enrolment consent.
                    </span>
                  </label>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Submit />
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
