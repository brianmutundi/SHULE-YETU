'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { linkStudent } from '../actions'

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? 'Linking...' : 'Save'}
    </Button>
  )
}

const RELATIONSHIPS = [
  'parent',
  'grandparent',
  'sibling',
  'aunt_uncle',
  'relative',
  'guardian',
  'other',
] as const

/**
 * Link Student dialog (section 7.3).
 *
 * The admission number resolves to a learner name as you type and Save stays
 * disabled until it matches, so a registrar cannot link the wrong learner
 * without noticing.
 */
export function LinkStudentDialog({
  guardianId,
  guardianName,
  resolve,
}: {
  guardianId: string
  guardianName: string
  resolve: (studentNo: string) => Promise<{ fullName: string } | null>
}) {
  const [open, setOpen] = useState(false)
  const [studentNo, setStudentNo] = useState('')
  const [match, setMatch] = useState<{ fullName: string } | null>(null)
  const [state, action] = useActionState(linkStudent, null)

  const onChange = async (value: string) => {
    setStudentNo(value)
    setMatch(null)
    const trimmed = value.trim()
    if (trimmed.length < 1) return
    const found = await resolve(trimmed)
    if (found) setMatch(found)
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Link Student
      </Button>
    )
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Linking a learner to {guardianName}</p>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>

      {state && !state.ok && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <form action={action} className="space-y-3">
        <input type="hidden" name="guardianId" value={guardianId} />

        <div className="space-y-1">
          <Label htmlFor={`studentNo-${guardianId}`} className="text-xs">
            Admission number
          </Label>
          <Input
            id={`studentNo-${guardianId}`}
            name="studentNo"
            value={studentNo}
            onChange={(e) => void onChange(e.target.value)}
            placeholder="e.g. S26001"
            className="h-8 font-mono"
            autoComplete="off"
          />
          {/* Announced to screen readers as the number resolves. */}
          <p className="text-xs" role="status" aria-live="polite">
            {match ? (
              <span className="text-foreground">
                Linking: <strong>{match.fullName}</strong>
              </span>
            ) : studentNo.trim() ? (
              <span className="text-muted-foreground">No matching learner yet</span>
            ) : null}
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor={`relationship-${guardianId}`} className="text-xs">
            Relationship
          </Label>
          <select
            id={`relationship-${guardianId}`}
            name="relationship"
            defaultValue="parent"
            className="h-8 w-full rounded-md border border-border bg-transparent px-2 text-sm"
          >
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {r.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-3 text-xs">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="isPrimary" className="size-3.5" />
            Primary
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="isEmergencyContact" className="size-3.5" />
            Emergency contact
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="isFeePayer" className="size-3.5" />
            Fee payer
          </label>
        </div>

        <Submit disabled={!match} />
      </form>
    </div>
  )
}

/** Small badge used for the relationship chips. */
export function RelationshipChip({ value }: { value: string }) {
  return (
    <Badge variant="secondary" className="capitalize">
      {value.replace('_', ' ')}
    </Badge>
  )
}