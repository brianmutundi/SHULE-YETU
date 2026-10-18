'use client'

import { useState, useTransition } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { setAcademicPeriod } from '@/lib/auth/period-actions'
import type { TermOption, YearOption } from '@/lib/auth/period'

/**
 * Academic year and term selectors.
 *
 * Applies immediately on change rather than behind an Apply button: a select
 * showing a value the app has not actually switched to is misleading, and
 * this is a high-frequency context control.
 *
 * Values are passed to the server action explicitly. Reading them back out of
 * the DOM serialised the previous selection, because Radix commits its hidden
 * input asynchronously.
 */
export function PeriodSelector({
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
    <div className="flex items-center gap-2" aria-busy={pending}>
      <label htmlFor="period-year" className="sr-only">
        Academic year
      </label>
      <Select
        value={String(year)}
        onValueChange={(value) => {
          const nextYear = Number(value)
          setYear(nextYear)
          apply(nextYear, term)
        }}
      >
        <SelectTrigger id="period-year" size="sm" className="w-32">
          <SelectValue placeholder="Year" />
        </SelectTrigger>
        <SelectContent>
          {years.map((option) => (
            <SelectItem key={option.id} value={String(option.calendarYear)}>
              {option.calendarYear}
              {option.isCurrent ? ' (current)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label htmlFor="period-term" className="sr-only">
        Term
      </label>
      <Select
        value={String(term)}
        onValueChange={(value) => {
          const nextTerm = Number(value)
          setTerm(nextTerm)
          apply(year, nextTerm)
        }}
      >
        <SelectTrigger id="period-term" size="sm" className="w-32">
          <SelectValue placeholder="Term" />
        </SelectTrigger>
        <SelectContent>
          {terms.map((option) => (
            <SelectItem key={option.id} value={String(option.termNumber)}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span role="status" className="sr-only">
        {pending ? 'Updating period' : ''}
      </span>
    </div>
  )
}