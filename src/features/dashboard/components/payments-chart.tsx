'use client'

import Link from 'next/link'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMoney } from '@/features/fees/money'
import { compactMoney, shortDate } from '../format'
import { RANGE_LABELS, RANGES, type Range } from '../ranges'
import type { SeriesPoint } from '../types'
import { ChartCard, EmptyChart } from './chart-card'

const tick = { fill: 'var(--muted-foreground)', fontSize: 12 }

/**
 * Payments over time, net of reversals. The range selector is a set of links:
 * the range is in the URL, the server re-queries, and the view can be shared.
 */
export function PaymentsChart({ data, range }: { data: SeriesPoint[]; range: Range }) {
  const hasMoney = data.some((p) => p.total !== 0)

  const selector = (
    <nav aria-label="Payments range" className="flex flex-wrap gap-1">
      {RANGES.map((r) => (
        <Link
          key={r}
          href={`/home?range=${r}`}
          scroll={false}
          aria-current={range === r ? 'true' : undefined}
          className={`rounded-full px-3 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
            range === r
              ? 'bg-primary font-medium text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          }`}
        >
          {RANGE_LABELS[r]}
        </Link>
      ))}
    </nav>
  )

  return (
    <ChartCard title="Payments" action={selector}>
      {!hasMoney ? (
        <EmptyChart message="No payments in this range." />
      ) : (
        <>
          <div role="img" aria-label={`Payments, ${RANGE_LABELS[range].toLowerCase()}`} className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="paymentsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="bucket" tick={tick} tickLine={false} tickFormatter={shortDate} minTickGap={24} />
                <YAxis tick={tick} tickLine={false} axisLine={false} width={72} tickFormatter={(v: number) => compactMoney(v)} />
                <Tooltip
                  labelFormatter={(label) => shortDate(String(label))}
                  formatter={(value) => [formatMoney(Number(value)), 'Collected']}
                />
                <Area type="monotone" dataKey="total" stroke="var(--chart-1)" strokeWidth={2} fill="url(#paymentsFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>Payments collected</caption>
            <thead>
              <tr><th>Date</th><th>Collected</th></tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.bucket}><td>{shortDate(p.bucket)}</td><td>{formatMoney(p.total)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </ChartCard>
  )
}
