import { z } from 'zod'
import { MAX_IMPORT_ROWS } from '@/lib/import/columns'

/**
 * Bulk import types.
 *
 * The row contract itself lives in lib/import so the parser, the validator and
 * the template writer all read one definition. This file holds the shapes that
 * cross the server/client boundary.
 */

export interface ImportRowIssue {
  field: string | null
  column: string | null
  message: string
}

export interface ImportPreviewRow {
  rowNumber: number
  /** Coerced values, or the raw cell text when the row failed validation. */
  values: Record<string, string>
  issues: ImportRowIssue[]
}

export interface ImportPreview {
  batchId: string
  totalRows: number
  validRows: number
  invalidRows: number
  /** First few rows of each outcome, enough to fix the file. */
  rows: ImportPreviewRow[]
  unknownColumns: string[]
  missingColumns: string[]
  truncated: boolean
}

export type ImportPreviewResult =
  | { ok: true; preview: ImportPreview }
  | { ok: false; error: string }

export type ImportRunResult =
  | { ok: true; imported: number; failed: number; total: number; errors: { rowNumber: number; message: string }[] }
  | { ok: false; error: string }

/** Guards the confirm step against a tampered or stale batch id. */
export const confirmImportSchema = z.object({
  batchId: z.string().uuid('That import is no longer available. Upload the file again.'),
})

/** Row cap, restated here so the client cannot raise it. */
export const rowLimit = MAX_IMPORT_ROWS

export type ConfirmImportInput = z.infer<typeof confirmImportSchema>