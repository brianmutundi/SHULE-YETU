'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/guards'
import { assignmentSchema, staffSchema, type AssignmentInput, type StaffActionResult, type StaffFormResult } from './schema'

/**
 * Staff actions (CLAUDE.md section 7.12).
 *
 * The national identifiers are written by app.save_staff() regardless of what
 * the client sends. They land in staff_sensitive, whose RLS decides who can read
 * them back; there is no client-side check here because a client-side check is
 * not a control, and pretending otherwise would be the kind of thing that looks
 * like security until someone reads the table directly.
 */

/** Add or edit a staff member. */
export async function saveStaff(
  _prev: StaffActionResult | null,
  formData: FormData,
): Promise<StaffActionResult> {
  await requirePermission('staff.manage')

  const parsed = staffSchema.safeParse({
    id: formData.get('id') ?? '',
    fullName: formData.get('fullName'),
    gender: formData.get('gender') ?? '',
    staffType: formData.get('staffType'),
    employer: formData.get('employer'),
    employmentType: formData.get('employmentType') ?? '',
    tscNumber: formData.get('tscNumber') ?? '',
    phone: formData.get('phone') ?? '',
    email: formData.get('email') ?? '',
    address: formData.get('address') ?? '',
    hiredOn: formData.get('hiredOn') ?? '',
    status: formData.get('status'),
    kraPin: formData.get('kraPin') ?? '',
    nssfShaNumber: formData.get('nssfShaNumber') ?? '',
    nationalId: formData.get('nationalId') ?? '',
  })

  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { ok: false, error: first.message }
  }

  const data = parsed.data
  const supabase = await createClient()

  const { data: staffId, error } = await supabase.rpc('save_staff', {
    p_payload: {
      id: data.id || undefined,
      fullName: data.fullName,
      gender: data.gender || undefined,
      staffType: data.staffType,
      employer: data.employer,
      employmentType: data.employmentType,
      tscNumber: data.tscNumber,
      phone: data.phone,
      email: data.email,
      address: data.address,
      hiredOn: data.hiredOn,
      status: data.status,
      kraPin: data.kraPin,
      nssfShaNumber: data.nssfShaNumber,
      nationalId: data.nationalId,
    },
  })

  if (error) {
    // A duplicate TSC number is the realistic failure: it identifies a person.
    return {
      ok: false,
      error:
        error.code === '23505'
          ? 'That TSC number is already used by another staff member.'
          : error.message,
    }
  }

  revalidatePath('/', 'layout')
  return { ok: true, staffId: staffId as string }
}

/** Soft delete only. Hard deletes are refused by RLS on public.staff. */
export async function softDeleteStaff(
  _prev: StaffFormResult | null,
  formData: FormData,
): Promise<StaffFormResult> {
  await requirePermission('staff.manage')

  const staffId = String(formData.get('staffId') ?? '')
  if (!staffId) return { ok: false, error: 'Missing staff record.' }

  const supabase = await createClient()

  const { error } = await supabase
    .from('staff')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', staffId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Assign a teacher to a stream.
 *
 * The guards in app.guard_teaching_assignment() decide what is valid: a class
 * teacher needs a specific stream, a subject teacher needs a subject or a
 * learning area, and a stream must belong to the named class. The form checks
 * the same rules so the registrar sees a sentence, and the database checks them
 * so they hold regardless of who calls.
 */
export async function saveAssignment(
  _prev: StaffFormResult | null,
  formData: FormData,
): Promise<StaffFormResult> {
  const session = await requirePermission('staff.manage')

  const parsed = assignmentSchema.safeParse({
    staffId: formData.get('staffId'),
    academicYearId: formData.get('academicYearId'),
    scope: formData.get('scope'),
    streamId: formData.get('streamId') ?? '',
    subjectId: formData.get('subjectId') ?? '',
    learningAreaId: formData.get('learningAreaId') ?? '',
  })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('teaching_assignments')
    .insert(toRow(parsed.data, session.tenantId))

  if (error) {
    if (error.code === '23505') {
      return {
        ok: false,
        error:
          'That assignment already exists, or another teacher is already the class teacher for this stream.',
      }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function removeAssignment(
  _prev: StaffFormResult | null,
  formData: FormData,
): Promise<StaffFormResult> {
  await requirePermission('staff.manage')

  const assignmentId = String(formData.get('assignmentId') ?? '')
  if (!assignmentId) return { ok: false, error: 'Missing assignment.' }

  const supabase = await createClient()
  const { error } = await supabase.from('teaching_assignments').delete().eq('id', assignmentId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Build the insert row.
 *
 * class_id is deliberately not sent. The stream determines it, and the trigger
 * derives it, so a class and a stream that disagree cannot be stored (section 9:
 * derived columns are derived in the database, not sent twice by the client).
 */
function toRow(input: AssignmentInput, tenantId: string) {
  return {
    tenant_id: tenantId,
    staff_id: input.staffId,
    academic_year_id: input.academicYearId,
    scope: input.scope,
    stream_id: input.streamId || null,
    subject_id: input.subjectId || null,
    learning_area_id: input.learningAreaId || null,
  }
}