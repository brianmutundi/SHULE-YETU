'use client'

import { useState, useTransition } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { setAcademicPeriod } from '@/lib/auth/period-actions'
import type { TermOption, YearOption } from '@/lib/auth/period'
import { formatTermLabel } from './nav-items'

/**
 * "Term N \u2022 YYYY" pill under the school name. It is also the app-wide
 * period switch (CLAUDE.md section 6): choosing a year or term applies at
 * once and every server component re-queries.
 *
 * Values go to the server action explicitly. Reading them from the DOM
 * serialised the previous selection once already.
 */
export function TermPillMenu({
  years,
  terms,
  calendarYear,
  termNumber,
}: {
  years: YearOption[]
  terms: TermOption[]
  calendarYear: number
  termNumber: number
}) {
  const [year, setYear] = useState(calendarYear)
  const [term, setTerm] = useState(termNumber)
  const [pending, startTransition] = useTransition()

  const apply = (nextYear: number, nextTerm: number) => {
    startTransition(async () => {
      await setAcademicPeriod(nextYear, nextTerm)
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Academic period: ${formatTermLabel(term, year)}. Change`}
        aria-busy={pending}
        className="inline-flex h-5 items-center rounded-full bg-primary-soft px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {formatTermLabel(term, year)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel>Academic year</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(year)}
          onValueChange={(value) => {
            const nextYear = Number(value)
            setYear(nextYear)
            apply(nextYear, term)
          }}
        >
          {years.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={String(option.calendarYear)}>
              {option.calendarYear}
              {option.isCurrent ? ' (current)' : ''}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Term</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(term)}
          onValueChange={(value) => {
            const nextTerm = Number(value)
            setTerm(nextTerm)
            apply(year, nextTerm)
          }}
        >
          {terms.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={String(option.termNumber)}>
              {option.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
