'use client'

import { useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { breakdownLabel, STAFF_DIMENSION_LABELS, STAFF_DIMENSIONS, type StaffDimension } from '../format'
import type { BreakdownRow } from '../types'
import { ChartCard, EmptyChart } from './chart-card'

const COLOURS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

/**
 * Staff donut with a Gender / Staff Type / Employer switch. All three
 * breakdowns arrive from the server, so switching is instant and makes no
 * request.
 */
export function StaffDonut({ data }: { data: Record<StaffDimension, BreakdownRow[]> }) {
  const [dimension, setDimension] = useState<StaffDimension>('gender')
  const rows = data[dimension].map((r) => ({ name: breakdownLabel(r.label), value: r.value }))
  const total = rows.reduce((sum, r) => sum + r.value, 0)

  const switcher = (
    <div role="group" aria-label="Group staff by" className="flex gap-1">
      {STAFF_DIMENSIONS.map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={dimension === d}
          onClick={() => setDimension(d)}
          className={`rounded-full px-3 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
            dimension === d
              ? 'bg-primary font-medium text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          }`}
        >
          {STAFF_DIMENSION_LABELS[d]}
        </button>
      ))}
    </div>
  )

  return (
    <ChartCard title="Staff" action={switcher}>
      {total === 0 ? (
        <EmptyChart message="No active staff yet." />
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <div
            role="img"
            aria-label={`Active staff by ${STAFF_DIMENSION_LABELS[dimension].toLowerCase()}`}
            className="relative h-48 w-48 shrink-0"
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={rows} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {rows.map((r, i) => (
                    <Cell key={r.name} fill={COLOURS[i % COLOURS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <p className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold tabular-nums">{total}</span>
              <span className="text-xs text-muted-foreground">staff</span>
            </p>
          </div>

          <ul role="list" className="space-y-1.5 text-sm">
            {rows.map((r, i) => (
              <li key={r.name} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{ background: COLOURS[i % COLOURS.length] }}
                />
                <span>{r.name}</span>
                <span className="ml-auto pl-4 tabular-nums text-muted-foreground">{r.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  )
}
