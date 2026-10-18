'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { TERM_COOKIE, YEAR_COOKIE } from '@/lib/auth/period'

/**
 * Switch the app-wide academic period.
 *
 * Takes explicit values rather than reading FormData: Radix Select commits its
 * hidden input asynchronously, so a form submit fired from onValueChange can
 * serialise the previous selection and silently switch to the wrong term.
 *
 * Written to cookies so Server Components read it directly (section 6).
 * revalidatePath refreshes the route so every widget re-queries the new term.
 */
export async function setAcademicPeriod(year: number, term: number): Promise<void> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error('Invalid academic year.')
  }
  if (term !== 1 && term !== 2 && term !== 3) {
    throw new Error('Invalid term.')
  }

  const cookieStore = await cookies()

  const options = {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  } as const

  cookieStore.set(YEAR_COOKIE, String(year), options)
  cookieStore.set(TERM_COOKIE, String(term), options)

  revalidatePath('/', 'layout')
}