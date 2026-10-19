'use client'

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PopulationRow } from '../types'
import { ChartCard, EmptyChart } from './chart-card'

const tick = { fill: 'var(--muted-foreground)', fontSize: 12 }

/** Active learners per class, boys and girls stacked. */
export function PopulationChart({ data }: { data: PopulationRow[] }) {
  return (
    <ChartCard title="Population">
      {data.length === 0 ? (
        <EmptyChart message="No active learners yet." />
      ) : (
        <>
          <div role="img" aria-label="Active learners per class, boys and girls" className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="classLabel" tick={tick} tickLine={false} interval={0} />
                <YAxis tick={tick} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'var(--accent)' }} />
                <Legend />
                <Bar dataKey="boys" name="Boys" stackId="p" fill="var(--chart-2)" />
                <Bar dataKey="girls" name="Girls" stackId="p" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>Active learners per class</caption>
            <thead>
              <tr><th>Class</th><th>Boys</th><th>Girls</th></tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.classLabel}><td>{r.classLabel}</td><td>{r.boys}</td><td>{r.girls}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </ChartCard>
  )
}
