'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { stageImport, confirmImport } from '../actions'
import type { ImportPreviewResult, ImportRunResult, ImportPreviewRow } from '../schema'
import { getImportColumns } from '@/lib/import/columns'
import type { OperatingMode } from '@/lib/school-type'

/**
 * Bulk import (CLAUDE.md section 7.8).
 *
 * Four steps in one screen: download the template, upload the filled file,
 * confirm the preview, then read the result. The registrar is never asked to
 * confirm a file they have not seen summarised first, and rows that failed are
 * listed by line number so they can be fixed and re-uploaded.
 *
 * The confirm step sends a batch id and nothing else. The rows written are the
 * rows the server validated at step two, not whatever the browser holds.
 */

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  )
}

function Counter({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'bad' | 'muted' }) {
  const color = tone === 'ok' ? 'text-foreground' : tone === 'bad' ? 'text-destructive' : 'text-muted-foreground'

  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

/** Columns worth showing in the preview table, in template order. */
function previewColumns(mode: OperatingMode) {
  return getImportColumns(mode)
    .filter((column) =>
      ['firstName', 'otherNames', 'surname', 'gender', 'dateOfBirth', 'classLabel', 'streamLabel', 'guardianName', 'guardianPhone'].includes(
        column.key,
      ),
    )
    .slice(0, 7)
}

function PreviewTable({ rows, mode }: { rows: ImportPreviewRow[]; mode: OperatingMode }) {
  const columns = previewColumns(mode)

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">Preview of the rows found in the uploaded file</caption>
        <thead className="border-b border-border bg-surface-2 text-left">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Row</th>
            {columns.map((column) => (
              <th key={column.key} scope="col" className="px-3 py-2 font-medium">
                {column.header}
              </th>
            ))}
            <th scope="col" className="px-3 py-2 font-medium">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.rowNumber} className={row.issues.length > 0 ? 'bg-destructive/5' : undefined}>
              <td className="px-3 py-2 font-mono text-xs tabular-nums">{row.rowNumber}</td>
              {columns.map((column) => (
                <td key={column.key} className="px-3 py-2 text-muted-foreground">
                  {row.values[column.key] || <span className="text-muted-foreground/50">-</span>}
                </td>
              ))}
              <td className="px-3 py-2">
                {row.issues.length === 0 ? (
                  <Badge variant="default">Ready</Badge>
                ) : (
                  <ul role="list" className="space-y-0.5">
                    {row.issues.map((issue, index) => (
                      <li key={index} className="text-xs text-destructive">
                        {issue.column ? `${issue.column}: ` : ''}
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ImportWizard({ mode }: { mode: OperatingMode }) {
  const [previewState, stageAction] = useActionState<ImportPreviewResult | null, FormData>(
    stageImport,
    null,
  )
  const [runState, confirmAction] = useActionState<ImportRunResult | null, FormData>(confirmImport, null)

  const preview = previewState?.ok ? previewState.preview : null
  const [dismissed, setDismissed] = useState(false)

  if (runState?.ok) {
    const { imported, failed, total, errors } = runState

    return (
      <Card>
        <CardHeader>
          <CardTitle>Import complete</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Counter label="Rows in file" value={total} tone="muted" />
            <Counter label="Imported" value={imported} tone="ok" />
            <Counter label="Skipped" value={failed} tone={failed > 0 ? 'bad' : 'muted'} />
          </div>

          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>{errors.length} row(s) were not imported</AlertTitle>
              <AlertDescription>
                <ul role="list" className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">
                  {errors.map((error) => (
                    <li key={error.rowNumber}>
                      <span className="font-mono text-xs">Row {error.rowNumber}:</span> {error.message}
                    </li>
                  ))}
                </ul>
                <p className="mt-2">
                  Every other row was imported. Fix these lines in the source file and upload it
                  again; the rows already imported will be reported as duplicates.
                </p>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/students/directory">Open the directory</Link>
            </Button>
            <Button asChild>
              <Link href="/students/new">Enrol a learner</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Step 1: template */}
      <Card>
        <CardHeader>
          <CardTitle>1. Get the template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            The template lists this school&apos;s classes and streams
            {mode === 'senior' ? ', and its pathways' : ''}. Do not rename or remove its column
            headers.
          </p>
          <Button asChild variant="outline">
            {/* `download` keeps this a file download. The route handler returns an
                .xlsx, so <Link> would be wrong here: it would client-navigate. */}
            <a href="/api/import/template" download>
              Download the template
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* Step 2: upload */}
      <Card>
        <CardHeader>
          <CardTitle>2. Upload the filled file</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={stageAction} className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="file" className="text-sm font-medium">
                Spreadsheet
              </label>
              <input
                id="file"
                name="file"
                type="file"
                accept=".xlsx,.csv"
                required
                className="block w-full rounded-lg border border-input bg-transparent p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-transparent file:text-sm file:font-medium"
              />
              <p className="text-xs text-muted-foreground">
                .xlsx or .csv, up to 5 MB and 5000 rows.
              </p>
            </div>

            <SubmitButton label="Check the file" pendingLabel="Reading..." />

            {previewState && !previewState.ok && (
              <Alert variant="destructive">
                <AlertTitle>That file was not accepted</AlertTitle>
                <AlertDescription>{previewState.error}</AlertDescription>
              </Alert>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Step 3: preview and confirm */}
      {preview && !dismissed && (
        <Card>
          <CardHeader>
            <CardTitle>3. Check and confirm</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Counter label="Rows in file" value={preview.totalRows} tone="muted" />
              <Counter label="Ready to import" value={preview.validRows} tone="ok" />
              <Counter
                label="Needs fixing"
                value={preview.invalidRows}
                tone={preview.invalidRows > 0 ? 'bad' : 'muted'}
              />
            </div>

            {preview.unknownColumns.length > 0 && (
              <Alert>
                <AlertTitle>Unrecognised columns ignored</AlertTitle>
                <AlertDescription>
                  {preview.unknownColumns.join(', ')}. These were not saved. If one of them should
                  have been read, check the header against the template.
                </AlertDescription>
              </Alert>
            )}

            {preview.truncated && (
              <p className="text-sm text-muted-foreground">
                Showing the first rows only. Every row was still checked.
              </p>
            )}

            <PreviewTable rows={preview.rows} mode={mode} />

            {preview.validRows > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {preview.invalidRows > 0
                    ? `${preview.invalidRows} row(s) will be skipped. The other ${preview.validRows} will be imported.`
                    : `All ${preview.validRows} row(s) will be imported.`}
                </p>

                <div className="flex flex-wrap gap-2">
                  <form action={confirmAction}>
                    <input type="hidden" name="batchId" value={preview.batchId} />
                    <SubmitButton
                      label={`Import ${preview.validRows} learner${preview.validRows === 1 ? '' : 's'}`}
                      pendingLabel="Importing..."
                    />
                  </form>
                  <Button type="button" variant="ghost" onClick={() => setDismissed(true)}>
                    Choose a different file
                  </Button>
                </div>
              </>
            ) : (
              <Alert variant="destructive">
                <AlertTitle>Nothing to import</AlertTitle>
                <AlertDescription>
                  No row passed validation. Fix the rows listed above in the source file and upload
                  it again.
                </AlertDescription>
              </Alert>
            )}

            {runState && !runState.ok && (
              <Alert variant="destructive">
                <AlertTitle>The import did not run</AlertTitle>
                <AlertDescription>{runState.error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}