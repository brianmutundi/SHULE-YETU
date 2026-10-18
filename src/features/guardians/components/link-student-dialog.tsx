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
import { linkStudent } from '../actions'
import type { GuardianActionResult } from '../actions'

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
 * without noticing. Controlled when `open` is passed (row menu); otherwise it
 * renders its own trigger button.
 */
export function LinkStudentDialog({
  guardianId,
  guardianName,
  resolve,
  open: controlledOpen,
  onOpenChange,
}: {
  guardianId: string
  guardianName: string
  resolve: (studentNo: string) => Promise<{ fullName: string } | null>
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [innerOpen, setInnerOpen] = useState(false)
  const controlled = controlledOpen !== undefined
  const open = controlled ? controlledOpen : innerOpen
  const setOpen = (next: boolean) => {
    if (!controlled) setInnerOpen(next)
    onOpenChange?.(next)
  }

  const [studentNo, setStudentNo] = useState('')
  const [match, setMatch] = useState<{ fullName: string } | null>(null)
  const [state, action] = useActionState<GuardianActionResult | null, FormData>(linkStudent, null)
  const [seenState, setSeenState] = useState<GuardianActionResult | null>(null)

  // Close on success. Adjusting state during render avoids the cascading
  // render the react-hooks lint rule warns about for effects.
  if (state !== seenState) {
    setSeenState(state)
    if (state?.ok) {
      setOpen(false)
      setStudentNo('')
      setMatch(null)
    }
  }

  const onChange = async (value: string) => {
    setStudentNo(value)
    setMatch(null)
    const trimmed = value.trim()
    if (trimmed.length < 1) return
    const found = await resolve(trimmed)
    if (found) setMatch(found)
  }

  return (
    <>
      {!controlled && (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Link Student
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Student</DialogTitle>
            <DialogDescription>Linking a learner to {guardianName}</DialogDescription>
          </DialogHeader>

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
        </DialogContent>
      </Dialog>
    </>
  )
}
