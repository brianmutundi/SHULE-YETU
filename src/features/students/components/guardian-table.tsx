'use client'

import { useState } from 'react'
import { EllipsisVerticalIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { resolveLearner } from '@/features/guardians/actions'
import { EditGuardianDialog } from '@/features/guardians/components/edit-guardian-dialog'
import { LinkStudentDialog } from '@/features/guardians/components/link-student-dialog'
import type { GuardianWithStudents } from '@/features/guardians/queries'

type Dialog = { kind: 'edit' | 'link'; guardian: GuardianWithStudents } | null

/**
 * Guardians pane: Full Name, Phone, Address, and a row menu with Edit and
 * Link Student. The row itself selects the guardian for the right panel.
 */
export function GuardianTable({
  guardians,
  selectedId,
  canManage,
  onSelect,
}: {
  guardians: GuardianWithStudents[]
  selectedId: string | null
  canManage: boolean
  onSelect: (id: string) => void
}) {
  const [dialog, setDialog] = useState<Dialog>(null)

  if (guardians.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No guardians match.</p>
  }

  return (
    <>
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-surface text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Full Name
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Phone
            </th>
            <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">
              Address
            </th>
            {canManage && (
              <th scope="col" className="w-10 px-1 py-2">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {guardians.map((g) => (
            <tr
              key={g.id}
              aria-selected={selectedId === g.id}
              className={selectedId === g.id ? 'bg-primary-soft' : 'hover:bg-accent'}
            >
              <td className="max-w-0 px-3 py-2">
                <button
                  type="button"
                  onClick={() => onSelect(g.id)}
                  className="w-full truncate text-left font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {g.fullName}
                </button>
              </td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{g.phone}</td>
              <td className="hidden max-w-0 truncate px-3 py-2 text-muted-foreground sm:table-cell">
                {g.address ?? '-'}
              </td>
              {canManage && (
                <td className="px-1 py-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Actions for ${g.fullName}`}
                      className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <EllipsisVerticalIcon className="size-4" aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit', guardian: g })}>
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setDialog({ kind: 'link', guardian: g })}>
                        Link Student
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {dialog?.kind === 'edit' && (
        <EditGuardianDialog
          key={dialog.guardian.id}
          guardian={dialog.guardian}
          open
          onOpenChange={(open) => !open && setDialog(null)}
        />
      )}
      {dialog?.kind === 'link' && (
        <LinkStudentDialog
          key={dialog.guardian.id}
          guardianId={dialog.guardian.id}
          guardianName={dialog.guardian.fullName}
          resolve={resolveLearner}
          open
          onOpenChange={(open) => !open && setDialog(null)}
        />
      )}
    </>
  )
}
