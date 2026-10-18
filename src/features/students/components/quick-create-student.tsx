'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { quickCreateStudent } from '../actions'
import type { FilterOptions } from '../queries'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving...' : 'Add learner'}
    </Button>
  )
}

/**
 * Quick registration (section 7.6). Deliberately minimal: the six-step wizard
 * with draft autosave and an atomic RPC arrives in Phase 5.
 */
export function QuickCreateStudent({ options }: { options: FilterOptions }) {
  const [state, action] = useActionState(quickCreateStudent, null)
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>Add learner</Button>
    )
  }

  return (
    <form action={action} className="space-y-4 rounded-lg border border-border p-4" noValidate>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Quick registration</h2>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>

      {state && !state.ok && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state?.ok && (
        <Alert role="status">
          <AlertDescription>
            Created with admission number <strong>{state.studentNo}</strong>.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" name="firstName" required maxLength={80} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="otherNames">Other names</Label>
          <Input id="otherNames" name="otherNames" maxLength={120} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="surname">Surname</Label>
          <Input id="surname" name="surname" maxLength={80} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="gender">Gender</Label>
          <select
            id="gender"
            name="gender"
            required
            className="h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dateOfBirth">Date of birth</Label>
          <Input id="dateOfBirth" name="dateOfBirth" type="date" required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue="active"
            className="h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm"
          >
            {['active', 'draft', 'inactive'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="streamId">Class and stream</Label>
          <select
            id="streamId"
            name="streamId"
            className="h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm"
          >
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
        </div>

        <div className="space-y-2">
          <Label htmlFor="upi">UPI (optional)</Label>
          <Input id="upi" name="upi" maxLength={24} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input id="phone" name="phone" type="tel" placeholder="07XX XXX XXX" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="county">County (optional)</Label>
          <Input id="county" name="county" maxLength={80} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="subCounty">Sub-county (optional)</Label>
          <Input id="subCounty" name="subCounty" maxLength={80} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        The admission number is allocated by the database and cannot be edited.
      </p>

      <Submit />
    </form>
  )
}