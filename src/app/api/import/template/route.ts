import { NextResponse } from 'next/server'
import { getSessionContext } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import { getAcademicPeriod } from '@/lib/auth/period'
import { createClient } from '@/lib/supabase/server'
import { buildImportTemplate } from '@/lib/import/template'

/**
 * Import template download.
 *
 * A GET route rather than a server action because the response is a binary
 * attachment; streaming a File through an action result would base64 it into the
 * RSC payload.
 *
 * Mode-aware and school-specific: the workbook carries this school's class
 * labels, this academic year's streams and, for a senior school, its pathway
 * codes (CLAUDE.md section 7.8).
 */
export async function GET() {
  const session = await getSessionContext()

  // Same permission the import itself requires. The template lists valid
  // classes and pathway codes, which is school reference data, not public.
  if (!can(session.role, 'student.enrol')) {
    return NextResponse.json({ error: 'Not permitted.' }, { status: 403 })
  }

  const { period } = await getAcademicPeriod()

  if (!period) {
    return NextResponse.json(
      { error: 'Set up an academic year and open a term before downloading a template.' },
      { status: 409 },
    )
  }

  const supabase = await createClient()

  const [{ data: streams }, { data: classes }, { data: pathways }] = await Promise.all([
    supabase
      .from('streams')
      .select('stream_label, class_id')
      .eq('academic_year_id', period.academicYearId)
      .order('stream_label'),
    supabase.from('classes').select('id, label'),
    supabase.from('pathways').select('code, name').order('sort_order'),
  ])

  const classById = new Map((classes ?? []).map((c) => [c.id, c.label]))

  const buffer = await buildImportTemplate({
    mode: session.operatingMode,
    schoolType: session.schoolType,
    schoolName: session.tenantName,
    streams: (streams ?? []).map((s) => ({
      classLabel: classById.get(s.class_id) ?? '',
      streamLabel: s.stream_label,
    })),
    pathways: (pathways ?? []).map((p) => ({ code: p.code, name: p.name })),
  })

  const fileName = `student-import-template-${session.tenantName.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.xlsx`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(buffer.byteLength),
      // The template embeds this school's class and pathway names, so it must
      // not sit in a shared cache.
      'Cache-Control': 'private, no-store',
    },
  })
}