import { getSessionContext } from '@/lib/auth/session'
import { getAcademicPeriod } from '@/lib/auth/period'
import { can } from '@/lib/auth/permissions'
import { ImportWizard } from '@/features/import/components/import-wizard'
import { getRecentImportBatches } from '@/features/import/queries'

// Auth-dependent, so it cannot be prerendered.
export const instant = false

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  staged: 'outline',
  importing: 'secondary',
  completed: 'default',
  failed: 'destructive',
}

export default async function StudentImportPage() {
  const session = await getSessionContext()
  const { period } = await getAcademicPeriod()

  // Same gate as the actions themselves, so a viewer sees nothing rather than
  // a form that fails on submit.
  if (!can(session.role, 'student.enrol')) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Bulk import</h1>
        <p className="text-muted-foreground">You do not have permission to import learners.</p>
      </div>
    )
  }

  const batches = await getRecentImportBatches()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bulk import</h1>
        <p className="text-muted-foreground">
          Bring in a register of learners from a spreadsheet.
          {period ? ` Streams resolve against ${period.calendarYear}.` : ''}
        </p>
      </div>

      <ImportWizard mode={session.operatingMode} />

      {batches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Recent imports</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">Recent bulk imports for this school</caption>
              <thead className="border-b border-border bg-surface-2 text-left">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">File</th>
                  <th scope="col" className="px-4 py-2 font-medium">Uploaded</th>
                  <th scope="col" className="px-4 py-2 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Imported</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Skipped</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td className="px-4 py-2 font-medium">{batch.fileName}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(batch.createdAt).toLocaleString('en-GB')}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs capitalize ${
                          STATUS_VARIANT[batch.status] === 'default'
                            ? 'bg-primary text-primary-foreground'
                            : STATUS_VARIANT[batch.status] === 'destructive'
                              ? 'bg-destructive/10 text-destructive'
                              : STATUS_VARIANT[batch.status] === 'outline'
                                ? 'border border-border text-muted-foreground'
                                : 'bg-secondary text-secondary-foreground'
                        }`}
                      >
                        {batch.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{batch.importedRows}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{batch.failedRows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}