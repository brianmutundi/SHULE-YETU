'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/types'
import { requirePermission } from '@/lib/auth/guards'
import { getAcademicPeriod } from '@/lib/auth/period'
import { MAX_IMPORT_ROWS, MAX_UPLOAD_BYTES } from '@/lib/import/columns'
import { parseUpload } from '@/lib/import/parse'
import { findDuplicates, validateRow } from '@/lib/import/validate'
import { confirmImportSchema, type ImportPreview, type ImportPreviewResult, type ImportRunResult } from './schema'

/** Rows shown in the preview. A 5000-row file cannot render as a table. */
const PREVIEW_LIMIT = 50

/**
 * Stage an uploaded file.
 *
 * Parses and validates on the server, writes the outcome to import_batch_rows,
 * and returns a batch id. Nothing from the browser is written as-is: the staged
 * rows are the ones the confirm step will read back, so the client cannot
 * substitute different data between preview and write (section 7.8).
 */
export async function stageImport(_prev: ImportPreviewResult | null, formData: FormData): Promise<ImportPreviewResult> {
  const session = await requirePermission('student.enrol')
  const { period } = await getAcademicPeriod()

  if (!period) {
    return { ok: false, error: 'Set up an academic year and open a term before importing learners.' }
  }

  const file = formData.get('file')

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Choose a file to upload.' }
  }

  // Checked before parsing: a 5 MB limit is a guard against a hostile upload,
  // and reading 500 MB into memory first to discover it is too big defeats it.
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: 'That file is larger than 5 MB. Split it into smaller files and import them one at a time.' }
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const parsed = await parseUpload(bytes, file.name, session.operatingMode)

  if (parsed.fatal) return { ok: false, error: parsed.fatal }

  if (parsed.missingColumns.length > 0) {
    return {
      ok: false,
      error: `The file is missing required column(s): ${parsed.missingColumns.join(', ')}. Re-download the template and copy the headers exactly.`,
    }
  }

  if (parsed.rows.length === 0) {
    return { ok: false, error: 'No learner rows were found. The first sheet should hold one learner per row, under the header row.' }
  }

  if (parsed.rows.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `That file has ${parsed.rows.length} rows. The limit is ${MAX_IMPORT_ROWS} per file.`,
    }
  }

  // Validate each row independently, then look for duplicates across the file.
  const validated = parsed.rows.map((row) => validateRow(row, session.operatingMode))
  const duplicates = findDuplicates(validated)

  for (const [rowNumber, issues] of duplicates) {
    const row = validated.find((r) => r.rowNumber === rowNumber)
    if (row) row.issues.push(...issues)
  }

  const invalidRows = validated.filter((row) => row.issues.length > 0)
  const validRows = validated.filter((row) => row.issues.length === 0)

  const supabase = await createClient()

  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      tenant_id: session.tenantId,
      file_name: file.name,
      operating_mode: session.operatingMode,
      academic_year_id: period.academicYearId,
      status: 'staged',
      total_rows: validated.length,
      uploaded_by: session.userId,
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    return { ok: false, error: batchError?.message ?? 'Could not stage that file. Try again.' }
  }

  // Stage every row, valid or not. A rejected row is worth keeping: it is how
  // the registrar sees which line failed and why, and it must not be imported
  // by a later confirm because status is 'failed', not 'valid'.
  const { error: rowsError } = await supabase.from('import_batch_rows').insert(
    validated.map((row) => ({
      tenant_id: session.tenantId,
      batch_id: batch.id,
      row_number: row.rowNumber,
      status: row.issues.length === 0 ? 'valid' : 'failed',
      payload: row.values,
      // The column is jsonb; RowIssue has no index signature, so it needs the
      // cast at the boundary rather than an index signature on the type.
      errors: row.issues as unknown as Json,
    })),
  )

  if (rowsError) {
    // The batch row exists with no staged rows, so it cannot be confirmed.
    await supabase.from('import_batches').delete().eq('id', batch.id)
    return { ok: false, error: 'Could not read that file. Check it is a valid .xlsx or .csv and try again.' }
  }

  const preview: ImportPreview = {
    batchId: batch.id,
    totalRows: validated.length,
    validRows: validRows.length,
    invalidRows: invalidRows.length,
    rows: validated.slice(0, PREVIEW_LIMIT).map((row) => ({
      rowNumber: row.rowNumber,
      values: row.values,
      issues: row.issues,
    })),
    unknownColumns: parsed.unknownColumns,
    missingColumns: parsed.missingColumns,
    truncated: validated.length > PREVIEW_LIMIT,
  }

  return { ok: true, preview }
}

/**
 * Write a staged batch.
 *
 * The only thing the browser sends is a batch id. The rows come from the
 * database, which is what makes "never trust the client" true rather than
 * aspirational.
 */
export async function confirmImport(_prev: ImportRunResult | null, formData: FormData): Promise<ImportRunResult> {
  await requirePermission('student.enrol')

  const parsed = confirmImportSchema.safeParse({ batchId: formData.get('batchId') })

  if (!parsed.success) {
    return { ok: false, error: 'That import is no longer available. Upload the file again.' }
  }

  const supabase = await createClient()

  // Guard the RPC's own preconditions with a readable message. The function
  // raises these too, but a thrown Postgres error is a poor thing to show a
  // registrar.
  const { data: batch } = await supabase
    .from('import_batches')
    .select('status')
    .eq('id', parsed.data.batchId)
    .maybeSingle()

  if (!batch) {
    return { ok: false, error: 'That import is no longer available. Upload the file again.' }
  }

  if (batch.status === 'completed') {
    return { ok: false, error: 'That file has already been imported.' }
  }

  if (batch.status === 'importing') {
    return { ok: false, error: 'That import is already running. Refresh in a moment to see the result.' }
  }

  // Nothing to write. Saying so is better than a run that reports 0 of 0.
  const { count: importable } = await supabase
    .from('import_batch_rows')
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', parsed.data.batchId)
    .eq('status', 'valid')

  if (!importable) {
    return {
      ok: false,
      error: 'No rows in that file passed validation, so there is nothing to import. Fix the reported rows and upload it again.',
    }
  }

  const { data: result, error } = await supabase.rpc('import_students', {
    p_batch: parsed.data.batchId,
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  const summary = result as unknown as {
    total: number
    imported: number
    failed: number
    errors: { rowNumber: number; message: string }[]
  }

  revalidatePath('/', 'layout')

  return {
    ok: true,
    imported: summary.imported,
    failed: summary.failed,
    total: summary.total,
    errors: summary.errors ?? [],
  }
}