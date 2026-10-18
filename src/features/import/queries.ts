import 'server-only'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/auth/session'

/**
 * Recent batches for this school.
 *
 * A registrar who uploaded a file, walked away and came back needs to find the
 * batch they staged rather than start over.
 */
export interface ImportBatchSummary {
  id: string
  fileName: string
  status: 'staged' | 'importing' | 'completed' | 'failed'
  totalRows: number
  importedRows: number
  failedRows: number
  createdAt: string
}

export async function getRecentImportBatches(limit = 10): Promise<ImportBatchSummary[]> {
  await connection()

  const supabase = await createClient()
  const session = await getSessionContext()

  const { data } = await supabase
    .from('import_batches')
    .select('id, file_name, status, total_rows, imported_rows, failed_rows, created_at')
    .eq('tenant_id', session.tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map((b) => ({
    id: b.id,
    fileName: b.file_name,
    status: b.status as ImportBatchSummary['status'],
    totalRows: b.total_rows,
    importedRows: b.imported_rows,
    failedRows: b.failed_rows,
    createdAt: b.created_at,
  }))
}

