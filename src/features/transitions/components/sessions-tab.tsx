'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { closeTerm, openTerm, saveSession } from '../actions'
import type { TermResult } from '../schema'
import type { TermRow } from '../queries'

/**
 * Sessions tab (CLAUDE.md section 7.10).
 *
 * Term dates are the school's own: the seeded Kenyan pattern is an assumption
 * ([A6]) and every date is editable here rather than buried in a migration.
 *
 * Exactly one term is active, which the database enforces through a partial
 * unique index, so "Open" is a single action rather than a toggle that could
 * leave two terms open.
 */

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  )
}

function EditableTerm({ term }: { term: TermRow }) {
  const [editing, setEditing] = useState(false)
  const [openState, openAction] = useActionState<TermResult | null, FormData>(openTerm, null)
  const [closeState, closeAction] = useActionState<TermResult | null, FormData>(closeTerm, null)

  if (!editing) {
    return (
      <tr>
        <td className="px-4 py-2 font-medium">
          {term.name}
          <span className="ml-2 text-xs text-muted-foreground">Term {term.termNumber}</span>
        </td>
        <td className="px-4 py-2 tabular-nums text-muted-foreground">{term.openedOn}</td>
        <td className="px-4 py-2 tabular-nums text-muted-foreground">
          {term.midtermBreakOn ?? '-'}
        </td>
        <td className="px-4 py-2 tabular-nums text-muted-foreground">{term.closingOn}</td>
        <td className="px-4 py-2 text-right tabular-nums">{term.admissions}</td>
        <td className="px-4 py-2">
          <div className="flex items-center gap-2">
            {term.status === 'active' ? (
              <>
                <Badge>Open</Badge>
                <form action={closeAction}>
                  <input type="hidden" name="sessionId" value={term.id} />
                  <Submit label="Close" pendingLabel="..." />
                </form>
              </>
            ) : (
              <>
                <Badge variant="outline">Closed</Badge>
                <form action={openAction}>
                  <input type="hidden" name="sessionId" value={term.id} />
                  <Submit label="Open" pendingLabel="..." />
                </form>
              </>
            )}
          </div>
        </td>
        <td className="px-4 py-2">
          <div className="flex flex-col items-end gap-1">
            <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>
              Edit dates
            </Button>
            <span aria-live="polite" className="text-xs text-destructive">
              {openState && !openState.ok ? openState.error : ''}
              {closeState && !closeState.ok ? closeState.error : ''}
            </span>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td colSpan={7} className="px-4 py-3">
        <TermForm term={term} onDone={() => setEditing(false)} />
      </td>
    </tr>
  )
}

function TermForm({ term, onDone }: { term?: TermRow; onDone?: () => void }) {
  const [state, action] = useActionState<TermResult | null, FormData>(saveSession, null)

  return (
    <form action={action} className="space-y-2">
      {term && <input type="hidden" name="sessionId" value={term.id} />}

      <div className="flex flex-wrap items-end gap-2">
        {!term && (
          <>
            <div className="space-y-1">
              <label htmlFor="name" className="text-xs text-muted-foreground">
                Term name
              </label>
              <input
                id="name"
                name="name"
                defaultValue="Term 1"
                required
                className="h-8 rounded-md border border-border bg-transparent px-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="termNumber" className="text-xs text-muted-foreground">
                Number
              </label>
              <select
                id="termNumber"
                name="termNumber"
                defaultValue="1"
                className="h-8 rounded-md border border-border bg-transparent px-2 text-sm"
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </div>
          </>
        )}

        <div className="space-y-1">
          <label htmlFor="openedOn" className="text-xs text-muted-foreground">
            Opens
          </label>
          <input
            id="openedOn"
            name="openedOn"
            type="date"
            defaultValue={term?.openedOn}
            required
            className="h-8 rounded-md border border-border bg-transparent px-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="midtermBreakOn" className="text-xs text-muted-foreground">
            Midterm break
          </label>
          <input
            id="midtermBreakOn"
            name="midtermBreakOn"
            type="date"
            defaultValue={term?.midtermBreakOn ?? ''}
            className="h-8 rounded-md border border-border bg-transparent px-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="closingOn" className="text-xs text-muted-foreground">
            Closes
          </label>
          <input
            id="closingOn"
            name="closingOn"
            type="date"
            defaultValue={term?.closingOn}
            required
            className="h-8 rounded-md border border-border bg-transparent px-2 text-sm"
          />
        </div>

        <div className="flex gap-2">
          <Submit label={term ? 'Save dates' : 'Add term'} pendingLabel="Saving..." />
          {onDone && (
            <Button type="button" size="sm" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      <p aria-live="polite" className="text-xs">
        {state?.ok && <span className="text-muted-foreground">Saved.</span>}
        {state && !state.ok && <span className="text-destructive">{state.error}</span>}
      </p>
    </form>
  )
}

export function SessionsTab({ terms }: { terms: TermRow[] }) {
  const [adding, setAdding] = useState(false)

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">Terms for this school</caption>
          <thead className="border-b border-border bg-surface-2 text-left">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Term</th>
              <th scope="col" className="px-4 py-2 font-medium">Opens</th>
              <th scope="col" className="px-4 py-2 font-medium">Midterm break</th>
              <th scope="col" className="px-4 py-2 font-medium">Closes</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Admissions</th>
              <th scope="col" className="px-4 py-2 font-medium">Status</th>
              <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {terms.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No terms yet. Add one to get started.
                </td>
              </tr>
            ) : (
              terms.map((term) => <EditableTerm key={term.id} term={term} />)
            )}
          </tbody>
        </table>
      </div>

      {adding ? (
        <Card>
          <CardHeader>
            <CardTitle>Add a term</CardTitle>
          </CardHeader>
          <CardContent>
            <TermForm onDone={() => setAdding(false)} />
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)}>
          Add a term
        </Button>
      )}

      <Alert>
        <AlertTitle>Term dates are yours to change</AlertTitle>
        <AlertDescription>
          These dates drive attendance, reports and fee periods. They were seeded
          from the standard Kenyan school year, so correct anything that does not
          match your calendar.
        </AlertDescription>
      </Alert>
    </div>
  )
}