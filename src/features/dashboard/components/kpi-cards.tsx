'use client'

import { useState } from 'react'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMoney } from '@/features/fees/money'

/**
 * Students, Staff, Expected, Accrued. The eye hides the two money figures, for
 * a screen in a shared office. Counts are not hidden.
 */
export function KpiCards({
  students,
  staff,
  expected,
  accrued,
  finance,
}: {
  students: number
  staff: number
  expected: number | null
  accrued: number | null
  finance: boolean
}) {
  const [hidden, setHidden] = useState(false)

  const money = (minor: number | null) => (hidden || minor === null ? 'KES ••••' : formatMoney(minor))

  const cards: { label: string; value: string; isMoney: boolean }[] = [
    { label: 'Students', value: students.toLocaleString('en'), isMoney: false },
    { label: 'Staff', value: staff.toLocaleString('en'), isMoney: false },
    ...(finance
      ? [
          { label: 'Expected', value: money(expected), isMoney: true },
          { label: 'Accrued', value: money(accrued), isMoney: true },
        ]
      : []),
  ]

  return (
    <section aria-label="Key figures" className="space-y-2">
      {finance && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={hidden}
            onClick={() => setHidden((h) => !h)}
          >
            {hidden ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
            {hidden ? 'Show amounts' : 'Hide amounts'}
          </Button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
