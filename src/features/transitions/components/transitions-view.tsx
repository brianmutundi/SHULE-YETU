'use client'

import { useState } from 'react'
import { SessionsTab } from './sessions-tab'
import { YearsTab } from './years-tab'
import { PromotionsTab } from './promotions-tab'
import type { PromotionRunSummary } from '../schema'
import type { TermRow, YearRow } from '../queries'

/**
 * Transitions (CLAUDE.md section 7.10).
 *
 * Tabs for Sessions, Academic Years and Promotions. Promotions is last because
 * it is the only one that moves learners, and it should not be one stray click
 * away from editing a term date.
 */

type Tab = 'sessions' | 'years' | 'promotions'

const TABS: { id: Tab; label: string }[] = [
  { id: 'sessions', label: 'Sessions' },
  { id: 'years', label: 'Academic Years' },
  { id: 'promotions', label: 'Promotions' },
]

export function TransitionsView({
  terms,
  years,
  runs,
  targetStreams,
  canManageSessions,
  canPromote,
}: {
  terms: TermRow[]
  years: YearRow[]
  runs: PromotionRunSummary[]
  targetStreams: { yearLabel: string; total: number }[]
  canManageSessions: boolean
  canPromote: boolean
}) {
  const [tab, setTab] = useState<Tab>('sessions')

  // A role without promotion rights must not be able to reach the tab at all,
  // rather than landing on a disabled form they cannot use.
  const available = TABS.filter((t) => {
    if (t.id === 'promotions') return canPromote
    return true
  })

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Transitions" className="flex flex-wrap gap-1">
        {available.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              tab === t.id
                ? 'bg-primary font-medium text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!canManageSessions && tab !== 'promotions' && (
        <p className="text-sm text-muted-foreground">
          You can view these but not change them.
        </p>
      )}

      {tab === 'sessions' && <SessionsTab terms={terms} />}
      {tab === 'years' && <YearsTab years={years} />}
      {tab === 'promotions' && (
        <PromotionsTab years={years} runs={runs} targetStreams={targetStreams} />
      )}
    </div>
  )
}