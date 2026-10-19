import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import { getReportData } from '@/features/assessments/queries'
import { ReportCardDocument } from '@/features/assessments/components/report-card'
import type { DocumentProps } from '@react-pdf/renderer'

/**
 * Report card PDF (CLAUDE.md section 7.13).
 *
 * A GET route rather than a server action: the response is a binary attachment,
 * and streaming it through an action result would base64 it into the RSC payload.
 *
 * Issued cards only. A learner who has not been issued a card for the term gets
 * a 404 rather than a card that was never signed off, because an unissued card
 * that looks official is worse than no card.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string; sessionId: string }> },
) {
  const session = await getSessionContext()

  if (!can(session.role, 'report_card.issue')) {
    return NextResponse.json({ error: 'Not permitted.' }, { status: 403 })
  }

  const { studentId, sessionId } = await params

  const supabase = await createClient()

  // A class teacher gets the cards for their own class only.
  const { data: mayIssue } = await supabase.rpc('can_issue_report_card_for', {
    p_student: studentId,
  })
  if (!mayIssue) {
    return NextResponse.json({ error: 'Not permitted.' }, { status: 403 })
  }

  const { data: issued } = await supabase
    .from('report_cards')
    .select('id')
    .eq('student_id', studentId)
    .eq('session_id', sessionId)
    .maybeSingle()

  if (!issued) {
    return NextResponse.json(
      { error: 'That report card has not been issued yet.' },
      { status: 404 },
    )
  }

  const data = await getReportData(studentId, sessionId)

  if (!data) {
    return NextResponse.json({ error: 'That learner was not found.' }, { status: 404 })
  }

  const [{ data: tenant }, { data: current }] = await Promise.all([
    supabase.from('tenants').select('name, address, phone, email').eq('id', session.tenantId).single(),
    supabase
      .from('sessions')
      .select('term_number, academic_year_id')
      .eq('id', sessionId)
      .single(),
  ])

  // The next term's opening date in the same year, so the card can say when
  // school resumes. Null at the end of the year, where the copy handles it.
  const { data: nextTerm } = await supabase
    .from('sessions')
    .select('opened_on')
    .eq('academic_year_id', current?.academic_year_id ?? '')
    .gt('term_number', current?.term_number ?? 0)
    .order('term_number')
    .limit(1)
    .maybeSingle()

  const next = nextTerm?.opened_on ?? null

  const element = createElement(ReportCardDocument, {
      schoolName: tenant?.name ?? session.tenantName,
      address: (tenant?.address as string | null) ?? '',
      phone: tenant?.phone ?? null,
      email: tenant?.email ?? null,
      data,
      nextTermOpens: next,
      mode: session.operatingMode,
      feeNote: null,
    }) as React.ReactElement<DocumentProps>

  const buffer = await renderToBuffer(element)

  const fileName = `report-card-${data.admissionNo}-${data.termName.replace(/\s+/g, '-')}-${data.calendarYear}.pdf`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Content-Length': String(buffer.byteLength),
      // A report card carries a child's name and results. Never cached.
      'Cache-Control': 'private, no-store',
    },
  })
}