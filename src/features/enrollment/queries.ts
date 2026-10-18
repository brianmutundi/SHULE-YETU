import 'server-only'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAcademicPeriod } from '@/lib/auth/period'

export interface WizardStream {
  id: string
  label: string
  classLabel: string
}

export interface WizardPathway {
  code: string
  name: string
}

/** Streams and pathways for the wizard, scoped to the selected year. */
export async function getWizardReferenceData(): Promise<{
  streams: WizardStream[]
  pathways: WizardPathway[]
}> {
  await connection()

  const supabase = await createClient()
  const { period } = await getAcademicPeriod()

  if (!period) return { streams: [], pathways: [] }

  const [{ data: streams }, { data: classes }, { data: pathways }] = await Promise.all([
    supabase
      .from('streams')
      .select('id, stream_label, class_id')
      .eq('academic_year_id', period.academicYearId)
      .order('stream_label'),
    supabase.from('classes').select('id, label').order('sort_order'),
    supabase.from('pathways').select('code, name').order('sort_order'),
  ])

  const classById = new Map((classes ?? []).map((c) => [c.id, c.label]))

  return {
    streams: (streams ?? []).map((s) => ({
      id: s.id,
      label: s.stream_label,
      classLabel: classById.get(s.class_id) ?? '',
    })),
    pathways: (pathways ?? []).map((p) => ({ code: p.code, name: p.name })),
  }
}