'use client'

import { useActionState, useCallback, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { saveMarks } from '../actions'
import { bandFor, type GridRow, type MarksResult, type PerformanceLevel } from '../schema'

/**
 * Marks entry grid (CLAUDE.md section 7.15).
 *
 * A grid rather than a list of fields because the work is repetitive and
 * keyboard-driven: a teacher marks forty learners by tabbing or arrowing down a
 * column without touching the mouse, which is the difference between entering a
 * class's marks in a few minutes and not doing it at all.
 *
 * Basic mode selects a competency level from this school's rubric. Senior mode
 * types a number. The two are not interchangeable and the screen never pretends
 * otherwise.
 */

interface Draft {
  code: string
  score: string
}

const BAND_STYLE: Record<string, string> = {
  exceeds: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
  meets: 'bg-primary/10 text-foreground border-primary/40',
  below: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40',
}

const BAND_LABEL: Record<string, string> = {
  exceeds: 'Exceeds expectation',
  meets: 'Meets expectation',
  below: 'Below expectation',
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? 'Saving...' : 'Save marks'}
    </Button>
  )
}

export function MarksGrid({
  taskId,
  streamId,
  rows,
  rubric,
  maxScore,
  mode,
}: {
  taskId: string
  streamId: string
  rows: GridRow[]
  rubric: PerformanceLevel[]
  maxScore: number | null
  mode: 'basic' | 'senior'
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [state, action] = useActionState<MarksResult | null, FormData>(saveMarks, null)

  const isBasic = mode === 'basic'

  const setCell = useCallback((studentId: string, patch: Partial<Draft>) => {
    setDrafts((prev) => {
      const existing = prev[studentId] ?? {
        code: rows.find((r) => r.studentId === studentId)?.performanceLevelCode ?? '',
        score: rows.find((r) => r.studentId === studentId)?.score?.toString() ?? '',
      }
      return { ...prev, [studentId]: { ...existing, ...patch } }
    })
  }, [rows])

  /**
   * Arrow-key navigation.
   *
   * Up and down move between learners in the same column, which is the movement
   * a teacher makes marking a class. Left and right would move between columns
   * on a different row, which is almost never what is wanted here.
   */
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement | HTMLInputElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return

    const index = rows.findIndex((r) => r.studentId === event.currentTarget.dataset.studentId)
    if (index === -1) return

    const next = rows[index + (event.key === 'ArrowDown' ? 1 : -1)]
    if (!next) return

    event.preventDefault()
    const target = document.querySelector<HTMLElement>(
      `[data-student-id="${next.studentId}"]`,
    )
    target?.focus()
  }

  const entries = useMemo(
    () =>
      Object.entries(drafts)
        .map(([studentId, draft]) => ({
          studentId,
          performanceLevelCode: draft.code,
          score: draft.score,
        }))
        .filter((e) => e.performanceLevelCode || e.score),
    [drafts],
  )

  const changed = entries.length

  if (rows.length === 0) {
    return (
      <Alert>
        <AlertTitle>No learners in this class</AlertTitle>
        <AlertDescription>Enrol learners before recording marks.</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      {isBasic ? (
        <>
          <p className="text-sm text-muted-foreground">
            Select one level per learner. Arrow keys move down the column.
          </p>

          <div className="flex flex-wrap gap-1.5">
            {rubric.map((level) => (
              <span
                key={level.code}
                title={(level.descriptor ?? '') as string}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  BAND_STYLE[bandFor(level.code) ?? 'meets']
                }`}
              >
                <span className="font-medium">{level.code}</span>
                <span className="ml-1 opacity-70">{level.points}</span>
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Enter a score out of {maxScore ?? 100} for each learner. Arrow keys move down the
          column.
        </p>
      )}

      <form action={action} className="space-y-3">
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="streamId" value={streamId} />
        <input type="hidden" name="entries" value={JSON.stringify(entries)} />

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Marks for this class</caption>
            <thead className="border-b border-border bg-surface-2 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">No.</th>
                <th scope="col" className="px-3 py-2 font-medium">Name</th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {isBasic ? 'Level' : 'Score'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const draft = drafts[row.studentId]
                const code = draft?.code ?? row.performanceLevelCode ?? ''
                const score = draft?.score ?? row.score?.toString() ?? ''

                return (
                  <tr key={row.studentId}>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums">
                      {row.studentNo}
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {row.fullName}
                      {row.gradedAt && (
                        <span className="ml-2">
                          <Badge variant="outline" className="text-xs">
                            graded
                          </Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isBasic ? (
                        <div className="flex flex-wrap gap-1">
                          {rubric.map((level) => (
                            <button
                              key={level.code}
                              type="button"
                              data-student-id={row.studentId}
                              aria-pressed={code === level.code}
                              aria-label={`${level.code} for ${row.fullName}`}
                              onKeyDown={onKeyDown}
                              onClick={() =>
                                setCell(row.studentId, {
                                  code: code === level.code ? '' : level.code,
                                })
                              }
                              className={`rounded border px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                                code === level.code
                                  ? BAND_STYLE[bandFor(level.code) ?? 'meets']
                                  : 'border-border text-muted-foreground hover:bg-accent'
                              }`}
                            >
                              {level.code}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={maxScore ?? undefined}
                          step="any"
                          data-student-id={row.studentId}
                          value={score}
                          onKeyDown={onKeyDown}
                          onChange={(e) => setCell(row.studentId, { score: e.target.value })}
                          aria-label={`Score for ${row.fullName}`}
                          className="h-8 w-24 rounded-md border border-border bg-transparent px-2 text-sm tabular-nums"
                        />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SaveButton disabled={changed === 0} />
          {changed === 0 && (
            <span className="text-sm text-muted-foreground">
              {rows.some((r) => r.gradedAt)
                ? 'Nothing changed since the last save.'
                : 'Nothing entered yet.'}
            </span>
          )}
        </div>

        {state?.ok && (
          <Alert>
            <AlertTitle>
              {state.skipped === 0
                ? `${state.saved} result${state.saved === 1 ? '' : 's'} saved`
                : `${state.saved} saved, ${state.skipped} rejected`}
            </AlertTitle>
            {state.skipped > 0 && (
              <AlertDescription>
                <ul role="list" className="mt-1 space-y-0.5">
                  {state.outcomes.map((o) => (
                    <li key={o.studentId} className="text-sm">
                      {o.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            )}
          </Alert>
        )}

        {state && !state.ok && (
          <Alert variant="destructive">
            <AlertTitle>The marks were not saved</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
      </form>

      {isBasic && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            What the levels mean
          </summary>
          <dl className="mt-2 space-y-1">
            {rubric.map((level) => (
              <div key={level.code} className="flex gap-2">
                <dt className="w-12 shrink-0 font-medium">{level.code}</dt>
                <dd className="text-muted-foreground">
                  {BAND_LABEL[bandFor(level.code) ?? 'meets']}
                  {level.descriptor ? `. ${level.descriptor}` : ''}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  )
}