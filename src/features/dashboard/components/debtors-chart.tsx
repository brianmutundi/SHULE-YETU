'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMoney } from '@/features/fees/money'
import { compactMoney } from '../format'
import type { DebtorRow } from '../types'
import { ChartCard, EmptyChart } from './chart-card'

const tick = { fill: 'var(--muted-foreground)', fontSize: 12 }

/** Outstanding balances by class and stream, largest first. */
export function DebtorsChart({ data }: { data: DebtorRow[] }) {
  return (
    <ChartCard title="Debtors">
      {data.length === 0 ? (
        <EmptyChart message="No outstanding balances." />
      ) : (
        <>
          <div
            role="img"
            aria-label="Outstanding fee balances by class and stream"
            style={{ height: Math.max(180, data.length * 34 + 40) }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="var(--border)" />
                <XAxis type="number" tick={tick} tickLine={false} tickFormatter={(v: number) => compactMoney(v)} />
                <YAxis type="category" dataKey="label" tick={tick} tickLine={false} width={96} />
                <Tooltip
                  cursor={{ fill: 'var(--accent)' }}
                  formatter={(value, _name, item) => [
                    `${formatMoney(Number(value))} (${(item.payload as DebtorRow).debtors} learners)`,
                    'Owed',
                  ]}
                />
                <Bar dataKey="owed" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>Outstanding balances</caption>
            <thead>
              <tr><th>Class</th><th>Learners</th><th>Owed</th></tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.label}><td>{r.label}</td><td>{r.debtors}</td><td>{formatMoney(r.owed)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </ChartCard>
  )
}
