'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  SCHOOL_TYPES,
  SCHOOL_TYPE_DEFINITIONS,
  getClassesForSchoolType,
  type SchoolType,
} from '@/lib/school-type'
import { registerSchool } from '../actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'Setting up your schoolâ€¦' : 'Create school and continue'}
    </Button>
  )
}

export function RegisterForm() {
  const [state, formAction] = useActionState(registerSchool, null)
  const [schoolType, setSchoolType] = useState<SchoolType>('primary_junior')

  const definition = SCHOOL_TYPE_DEFINITIONS[schoolType]
  const classes = getClassesForSchoolType(schoolType)

  return (
    <form action={formAction} className="space-y-8" noValidate>
      {state && !state.ok && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {/* Step 1 â€” school type. Everything else depends on this choice. */}
      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold">What kind of school is this?</legend>
        <p className="text-sm text-muted-foreground">
          This choice is permanent once students are enrolled. It sets the classes, assessments and
          reports your school will use.
        </p>

        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="School type">
          {SCHOOL_TYPES.map((type) => {
            const def = SCHOOL_TYPE_DEFINITIONS[type]
            const selected = type === schoolType
            return (
              <label
                key={type}
                className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-4 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary-soft ${
                  selected ? 'border-primary bg-primary-soft' : 'border-border'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="schoolType"
                    value={type}
                    checked={selected}
                    onChange={() => setSchoolType(type)}
                    className="size-4 accent-[var(--primary)]"
                  />
                  <span className="font-medium">{def.label}</span>
                </div>
                <span className="text-sm text-muted-foreground">{def.description}</span>
                <span className="mt-1 text-xs text-muted-foreground">
                  {getClassesForSchoolType(type).length} classes
                </span>
              </label>
            )
          })}
        </div>

        <div className="rounded-md bg-surface-2 p-4 text-sm" aria-live="polite">
          <p className="font-medium">
            {definition.label} will be set up with:
          </p>
          <p className="mt-1 text-muted-foreground">{classes.join(' â†’ ')}</p>
          {definition.exitCheckpoints.length > 0 ? (
            <p className="mt-2 text-muted-foreground">
              Exit assessment: {definition.exitCheckpoints.join(' and ')}.
            </p>
          ) : (
            <p className="mt-2 text-muted-foreground">Learners are placed from other schools after Grade 9.</p>
          )}
        </div>
      </fieldset>

      {/* Step 2 â€” school profile */}
      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold">School details</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="schoolName">School name</Label>
            <Input id="schoolName" name="schoolName" required placeholder="e.g. Greenfield Junior School" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ownership">Ownership</Label>
            <Select name="ownership" defaultValue="private">
              <SelectTrigger id="ownership" className="w-full">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="public">Public</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="boardingMode">Day / boarding</Label>
            <Select name="boardingMode" defaultValue="day">
              <SelectTrigger id="boardingMode" className="w-full">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="boarding">Boarding</SelectItem>
                <SelectItem value="mixed">Mixed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gender">Boys / girls</Label>
            <Select name="gender" defaultValue="mixed">
              <SelectTrigger id="gender" className="w-full">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mixed">Mixed</SelectItem>
                <SelectItem value="boys">Boys</SelectItem>
                <SelectItem value="girls">Girls</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="county">County</Label>
            <Input id="county" name="county" required placeholder="e.g. Kiambu" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subCounty">Sub-county</Label>
            <Input id="subCounty" name="subCounty" required placeholder="e.g. Gatundu South" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="schoolCode">School code (optional)</Label>
            <Input id="schoolCode" name="schoolCode" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="knecCenterCode">KNEC centre code (optional)</Label>
            <Input id="knecCenterCode" name="knecCenterCode" />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="sponsor">Sponsor (optional)</Label>
            <Input id="sponsor" name="sponsor" placeholder="e.g. Anglican, Catholic, none" />
          </div>
        </div>
      </fieldset>

      {/* Step 3 â€” administrator account */}
      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold">Your administrator account</legend>
        <p className="text-sm text-muted-foreground">
          You become the school owner and can invite other staff later.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="adminName">Full name</Label>
            <Input id="adminName" name="adminName" required autoComplete="name" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adminEmail">Email</Label>
            <Input id="adminEmail" name="adminEmail" type="email" required autoComplete="email" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adminPhone">Phone</Label>
            <Input
              id="adminPhone"
              name="adminPhone"
              type="tel"
              required
              autoComplete="tel"
              placeholder="07XX XXX XXX"
              aria-describedby="phone-hint"
            />
            <p id="phone-hint" className="text-xs text-muted-foreground">
              Kenyan mobile number. Used for SMS alerts.
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              aria-describedby="password-hint"
            />
            <p id="password-hint" className="text-xs text-muted-foreground">
              At least 8 characters.
            </p>
          </div>
        </div>
      </fieldset>

      <SubmitButton />
    </form>
  )
}