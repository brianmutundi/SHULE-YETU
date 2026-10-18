'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { createAcademicYear, setCurrentYear } from '../actions'
import type { TermResult, YearResult } from '../schema'
import type { YearRow } from '../queries'

/**
 * Academic years tab (CLAUDE.md section 7.10).
 *
 * A year is a single calendar year label (2027), not a span. Exactly one is
 * current per tenant, enforced by a partial unique index, so "Make current"
 * demotes the previous one in the same statement.
 */

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  )
}

function YearRowView({ year }: { year: YearRow }) {
  const [state, action] = useActionState<TermResult | null, FormData>(setCurrentYear, null)

  return (
    <tr>
      <td className="px-4 py-2 font-medium tabular-nums">{year.calendarYear}</td>
      <td className="px-4 py-2 tabular-nums text-muted-foreground">{year.startsOn}</td>
      <td className="px-4 py-2 tabular-nums text-muted-foreground">{year.endsOn}</td>
      <td className="px-4 py-2 text-right tabular-nums">{year.termCount}</td>
      <td className="px-4 py-2 text-right tabular-nums">{year.learnerCount}</td>
      <td className="px-4 py-2">
        {year.isCurrent ? (
          <Badge>Current</Badge>
        ) : (
          <form action={action} className="flex items-center gap-2">
            <input type="hidden" name="yearId" value={year.id} />
            <Submit label="Make current" pendingLabel="..." />
            {state && !state.ok && (
              <span className="text-xs text-destructive">{state.error}</span>
            )}
          </form>
        )}
      </td>
    </tr>
  )
}

export function YearsTab({ years }: { years: YearRow[] }) {
  const [state, action] = useActionState<YearResult | null, FormData>(createAcademicYear, null)
  const latest = years.length > 0 ? years[0].calendarYear + 1 : new Date().getFullYear()

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">Academic years</caption>
          <thead className="border-b border-border bg-surface-2 text-left">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Year</th>
              <th scope="col" className="px-4 py-2 font-medium">Starts</th>
              <th scope="col" className="px-4 py-2 font-medium">Ends</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Terms</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Learners</th>
              <th scope="col" className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {years.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No academic years yet. Create one to begin.
                </td>
              </tr>
            ) : (
              years.map((year) => <YearRowView key={year.id} year={year} />)
            )}
          </tbody>
        </table>
      </div>

      <form action={action} className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label htmlFor="calendarYear" className="text-xs text-muted-foreground">
            New academic year
          </label>
          <input
            id="calendarYear"
            name="calendarYear"
            type="number"
            defaultValue={latest}
            min={2000}
            max={2100}
            required
            className="h-8 w-32 rounded-md border border-border bg-transparent px-2 text-sm"
          />
        </div>
        <Submit label="Create year" pendingLabel="Creating..." />
        {state?.ok && <span className="text-sm text-muted-foreground">Created.</span>}
      </form>

      {state && !state.ok && (
        <Alert variant="destructive">
          <AlertTitle>The year was not created</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Alert>
        <AlertTitle>Creating a year does not create streams</AlertTitle>
        <AlertDescription>
          The three terms are created automatically, with dates carried forward from
          the previous year. Streams for a new year are created on the Promotions
          tab, just before they are needed.
        </AlertDescription>
      </Alert>
    </div>
  )
}