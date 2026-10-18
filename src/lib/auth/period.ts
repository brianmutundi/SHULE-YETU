import 'server-only'
import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * The app-wide academic period: which academic year, and which term.
 *
 * CLAUDE.md section 6 makes this the context every widget re-queries on. It
 * lives in cookies so Server Components can read it without a client round
 * trip. Falls back to the tenant's current year and active term.
 */

export const YEAR_COOKIE = 'sy_year'
export const TERM_COOKIE = 'sy_term'

export interface AcademicPeriod {
  academicYearId: string
  calendarYear: number
  sessionId: string
  termNumber: 1 | 2 | 3
  termName: string
  openedOn: string
  midtermBreakOn: string | null
  closingOn: string
  isCurrentTerm: boolean
}

export interface TermOption {
  id: string
  termNumber: 1 | 2 | 3
  name: string
  openedOn: string
  closingOn: string
}

export interface YearOption {
  id: string
  calendarYear: number
  isCurrent: boolean
}

/**
 * Resolve the requested year and term, falling back to the current year and
 * the active term when the cookie is absent or points at a stale record.
 */
export async function getAcademicPeriod(): Promise<{
  period: AcademicPeriod | null
  years: YearOption[]
  terms: TermOption[]
}> {
  await connection()

  const supabase = await createClient()
  const cookieStore = await cookies()

  const requestedYear = Number(cookieStore.get(YEAR_COOKIE)?.value)
  const requestedTerm = Number(cookieStore.get(TERM_COOKIE)?.value)

  const { data: years } = await supabase
    .from('academic_years')
    .select('id, calendar_year, is_current')
    .order('calendar_year', { ascending: false })

  const yearList: YearOption[] = (years ?? []).map((y) => ({
    id: y.id,
    calendarYear: y.calendar_year,
    isCurrent: y.is_current,
  }))

  if (yearList.length === 0) {
    return { period: null, years: [], terms: [] }
  }

  const year =
    yearList.find((y) => y.calendarYear === requestedYear) ??
    yearList.find((y) => y.isCurrent) ??
    yearList[0]

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, term_number, name, opened_on, midterm_break_on, closing_on, status')
    .eq('academic_year_id', year.id)
    .order('term_number')

  const termList: TermOption[] = (sessions ?? []).map((s) => ({
    id: s.id,
    termNumber: s.term_number as 1 | 2 | 3,
    name: s.name,
    openedOn: s.opened_on,
    closingOn: s.closing_on,
  }))

  if (termList.length === 0) {
    return { period: null, years: yearList, terms: [] }
  }

  const chosen =
    termList.find((t) => t.termNumber === requestedTerm) ??
    sessions?.find((s) => s.status === 'active') ??
    null

  const chosenRow = sessions?.find((s) => s.id === (chosen?.id ?? null))

  if (!chosen || !chosenRow) {
    return { period: null, years: yearList, terms: termList }
  }

  return {
    period: {
      academicYearId: year.id,
      calendarYear: year.calendarYear,
      sessionId: chosenRow.id,
      termNumber: chosenRow.term_number as 1 | 2 | 3,
      termName: chosenRow.name,
      openedOn: chosenRow.opened_on,
      midtermBreakOn: chosenRow.midterm_break_on,
      closingOn: chosenRow.closing_on,
      isCurrentTerm: chosenRow.status === 'active',
    },
    years: yearList,
    terms: termList,
  }
}