'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { planPromotion, prepareTargetYear, rollbackPromotion, runPromotion } from '../actions'
import {
  STRATEGY_LABELS,
  STREAM_STRATEGIES,
  type PlanResult,
  type PromotionRunSummary,
  type RollbackResult,
  type RunResult,
  type StreamStrategy,
  type TermResult,
} from '../schema'
import type { YearRow } from '../queries'

/**
 * Promotions tab (CLAUDE.md section 7.10).
 *
 * Three steps, and the third is behind an explicit confirmation because it
 * cannot be undone by editing a field: a dry run, a review, then the commit.
 *
 * The screen refuses to imply that a promotion is safe. Two things it does
 * instead:
 *
 *   - Held learners are named, not counted. A Grade 6 cohort sitting KPSEA is
 *     not promoted; the admin needs to see exactly who is waiting and why.
 *   - A failed plan blocks the commit. The database aborts the whole run rather
 *     than promoting the learners it can and skipping the rest, and this screen
 *     shows why rather than offering a partial promotion.
 */

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  )
}

function Count({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'bad' }) {
  const color = tone === 'bad' ? 'text-destructive' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : ''
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

const OUTCOME_LABEL: Record<string, string> = {
  promoted: 'Promoted',
  held: 'Held',
  completed: 'Completed this level',
  graduated: 'Graduated',
  failed: 'Cannot be promoted',
}

function PlanTable({ plan }: { plan: NonNullable<Extract<PlanResult, { ok: true }>['plan']> }) {
  // Cap the rendered rows: a 900-learner school produces a plan too long to
  // read, and the counts above it are what the decision is made on.
  const rows = plan.rows.slice(0, 200)

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">Promotion dry run</caption>
        <thead className="border-b border-border bg-surface-2 text-left">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">No.</th>
            <th scope="col" className="px-3 py-2 font-medium">Name</th>
            <th scope="col" className="px-3 py-2 font-medium">From</th>
            <th scope="col" className="px-3 py-2 font-medium">To</th>
            <th scope="col" className="px-3 py-2 font-medium">Outcome</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const name = [row.first_name, row.other_names, row.surname]
              .filter(Boolean)
              .join(' ')

            return (
              <tr
                key={row.id}
                className={row.outcome === 'failed' ? 'bg-destructive/5' : undefined}
              >
                <td className="px-3 py-2 font-mono text-xs tabular-nums">{row.student_no}</td>
                <td className="px-3 py-2">{name}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {row.from_class_label} {row.stream_label}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {row.to_class_label ? `${row.to_class_label}` : '-'}
                </td>
                <td className="px-3 py-2">
                  <span className="flex flex-col gap-0.5">
                    <span>{OUTCOME_LABEL[row.outcome] ?? row.outcome}</span>
                    {row.reason && (
                      <span className="text-xs text-muted-foreground">{row.reason}</span>
                    )}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {plan.rows.length > rows.length && (
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          Showing the first {rows.length} of {plan.rows.length} learners.
        </p>
      )}
    </div>
  )
}

export function PromotionsTab({
  years,
  runs,
  targetStreams,
}: {
  years: YearRow[]
  runs: PromotionRunSummary[]
  targetStreams: { yearLabel: string; total: number }[]
}) {
  const [planState, planAction] = useActionState<PlanResult | null, FormData>(planPromotion, null)
  const [runState, runAction] = useActionState<RunResult | null, FormData>(runPromotion, null)
  const [rollbackState, rollbackAction] = useActionState<RollbackResult | null, FormData>(
    rollbackPromotion,
    null,
  )
  const [streamsState, streamsAction] = useActionState<TermResult | null, FormData>(
    prepareTargetYear,
    null,
  )

  const [strategy, setStrategy] = useState<StreamStrategy>('keep')

  const plan = planState?.ok ? planState.plan : null

  if (runState?.ok) {
    const { promoted, held, leftSchool, total } = runState
    return (
      <Card>
        <CardHeader>
          <CardTitle>Promotion complete</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Count label="In scope" value={total} />
            <Count label="Promoted" value={promoted} />
            <Count label="Held" value={held} tone={held > 0 ? 'warn' : undefined} />
            <Count label="Left the school" value={leftSchool} />
          </div>
          {held > 0 && (
            <Alert>
              <AlertTitle>{held} learner(s) were held</AlertTitle>
              <AlertDescription>
                These learners were in an exit-checkpoint class and their result has not
                been released. They stay in their current class until it is, and they
                will promote in the next run.
              </AlertDescription>
            </Alert>
          )}
          <p className="text-sm text-muted-foreground">
            The run is recorded and can be rolled back from the history below.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Step 1: dry run */}
      <Card>
        <CardHeader>
          <CardTitle>Plan a promotion</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={planAction} className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label htmlFor="fromYear" className="text-xs text-muted-foreground">
                  Promote out of
                </label>
                <select
                  id="fromYear"
                  name="fromYear"
                  required
                  className="h-8 rounded-md border border-border bg-transparent px-2 text-sm"
                >
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.calendarYear}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="toYear" className="text-xs text-muted-foreground">
                  Promote into
                </label>
                <select
                  id="toYear"
                  name="toYear"
                  required
                  className="h-8 rounded-md border border-border bg-transparent px-2 text-sm"
                >
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.calendarYear}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Streams</span>
                <div role="radiogroup" aria-label="Stream assignment" className="flex flex-col gap-1">
                  {STREAM_STRATEGIES.map((value) => (
                    <label key={value} className="flex items-start gap-2 text-sm">
                      <input
                        type="radio"
                        name="strategy"
                        value={value}
                        checked={strategy === value}
                        onChange={() => setStrategy(value)}
                        className="mt-1"
                      />
                      <span>
                        {STRATEGY_LABELS[value].label}
                        <span className="block text-xs text-muted-foreground">
                          {STRATEGY_LABELS[value].help}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <Submit label="Run the dry run" pendingLabel="Planning..." />
          </form>

          {planState && !planState.ok && (
            <Alert variant="destructive" className="mt-3">
              <AlertTitle>The plan could not be produced</AlertTitle>
              <AlertDescription>{planState.error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Step 2: review */}
      {plan && (
        <Card>
          <CardHeader>
            <CardTitle>Dry run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <Count label="In scope" value={plan.total} />
              <Count label="Will promote" value={plan.promoted} />
              <Count label="Held" value={plan.held} tone={plan.held > 0 ? 'warn' : undefined} />
              <Count label="Left the school" value={plan.leftSchool} />
            </div>

            {plan.failed > 0 && (
              <Alert variant="destructive">
                <AlertTitle>{plan.failed} learner(s) cannot be promoted</AlertTitle>
                <AlertDescription>
                  Nothing will be moved. The target year needs streams in the classes
                  being promoted into. Create them below, then plan again.
                </AlertDescription>
              </Alert>
            )}

            {plan.held > 0 && (
              <Alert>
                <AlertTitle>{plan.held} learner(s) are held at an exit checkpoint</AlertTitle>
                <AlertDescription>
                  <ul role="list" className="mt-1 space-y-0.5">
                    {plan.heldDetail.map((h, i) => (
                      <li key={i} className="text-sm">
                        <span className="font-mono text-xs">
                          {(h.studentNo as string) ?? ''}
                        </span>{' '}
                        {String(h.fromClass ?? '')} {String(h.stream ?? '')} — {String(h.reason ?? '')}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <PlanTable plan={plan} />

            {/* Step 3: commit */}
            {plan.failed === 0 && plan.total > 0 && (
              <>
                <form action={runAction} className="space-y-3 border-t border-border pt-4">
                  <input type="hidden" name="fromYear" value={plan.fromYear} />
                  <input type="hidden" name="toYear" value={plan.toYear} />
                  <input type="hidden" name="strategy" value={plan.strategy} />

                  <div className="space-y-1">
                    <label htmlFor="note" className="text-xs text-muted-foreground">
                      Note (optional)
                    </label>
                    <input
                      id="note"
                      name="note"
                      maxLength={200}
                      placeholder="End of year promotion"
                      className="h-8 w-full max-w-sm rounded-md border border-border bg-transparent px-2 text-sm"
                    />
                  </div>

                  <Submit
                    label={`Promote ${plan.promoted} learner${plan.promoted === 1 ? '' : 's'}`}
                    pendingLabel="Promoting..."
                  />
                  <p className="text-xs text-muted-foreground">
                    This moves learners. It is recorded and can be rolled back, but it is
                    not a draft.
                  </p>
                </form>

                {runState && !runState.ok && (
                  <Alert variant="destructive">
                    <AlertTitle>The promotion did not run</AlertTitle>
                    <AlertDescription>{runState.error}</AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Destination-year setup */}
      <Card>
        <CardHeader>
          <CardTitle>Prepare a destination year</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A year needs streams before anyone can be promoted into it. This copies the
            stream layout from the current year.
          </p>

          {targetStreams.length > 0 && (
            <ul role="list" className="space-y-1">
              {targetStreams.map((s) => (
                <li key={s.yearLabel} className="text-sm">
                  <span className="font-medium">{s.yearLabel}</span>{' '}
                  <span className="text-muted-foreground">
                    {s.total === 0 ? 'no streams yet' : `${s.total} streams`}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <form action={streamsAction} className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label htmlFor="yearId" className="text-xs text-muted-foreground">
                Year
              </label>
              <select
                id="yearId"
                name="yearId"
                className="h-8 rounded-md border border-border bg-transparent px-2 text-sm"
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.calendarYear}
                  </option>
                ))}
              </select>
            </div>
            <Submit label="Create streams" pendingLabel="Creating..." />
          </form>

          {streamsState && !streamsState.ok && (
            <Alert variant="destructive">
              <AlertTitle>Streams were not created</AlertTitle>
              <AlertDescription>{streamsState.error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* History */}
      {runs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Promotion history</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">Past promotions</caption>
                <thead className="border-b border-border bg-surface-2 text-left">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">When</th>
                    <th scope="col" className="px-4 py-2 font-medium">Years</th>
                    <th scope="col" className="px-4 py-2 font-medium">Streams</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Promoted</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Held</th>
                    <th scope="col" className="px-4 py-2 font-medium">Status</th>
                    <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td className="px-4 py-2 text-muted-foreground">
                        {new Date(run.createdAt).toLocaleString('en-GB')}
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        {run.fromYearLabel} to {run.toYearLabel}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {STRATEGY_LABELS[run.strategy].label}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{run.promoted}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{run.held}</td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={
                            run.status === 'completed'
                              ? 'default'
                              : run.status === 'rolled_back'
                                ? 'secondary'
                                : run.status === 'failed'
                                  ? 'destructive'
                                  : 'outline'
                          }
                        >
                          {run.status === 'dry_run' ? 'not run' : run.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        {run.status === 'completed' && (
                          <form action={rollbackAction} className="flex items-center gap-2">
                            <input type="hidden" name="runId" value={run.id} />
                            <Button type="submit" size="xs" variant="outline">
                              Roll back
                            </Button>
                            {rollbackState?.ok && (
                              <span className="text-xs text-muted-foreground">
                                {rollbackState.restored} restored
                              </span>
                            )}
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {rollbackState && !rollbackState.ok && (
              <Alert variant="destructive" className="mt-3">
                <AlertTitle>The rollback did not run</AlertTitle>
                <AlertDescription>{rollbackState.error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}