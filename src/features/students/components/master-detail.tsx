'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { resolveLearner, unlinkStudent } from '@/features/guardians/actions'
import { LinkStudentDialog } from '@/features/guardians/components/link-student-dialog'
import type {
  GuardianWithStudents,
  MasterStudent,
  MasterStudentListItem,
} from '@/features/guardians/queries'

export type Pane = 'students' | 'guardians'

/** Unlink is a server action, so it gets its own form rather than a handler. */
function UnlinkButton({ guardianId, studentId }: { guardianId: string; studentId: string }) {
  const [, action] = useActionState(unlinkStudent, null)

  return (
    <form action={action} className="ml-auto">
      <input type="hidden" name="guardianId" value={guardianId} />
      <input type="hidden" name="studentId" value={studentId} />
      <Button size="sm" variant="ghost" type="submit">
        Unlink
      </Button>
    </form>
  )
}

/**
 * Master-detail screen (section 7.3).
 *
 * The arrow beside the list header flips the left pane between learners and
 * guardians, and the right pane follows the selection. Selection lives in
 * the URL (?id=) so it is shareable and survives a refresh.
 */
export function MasterDetail({
  pane: initialPane,
  students,
  guardians,
  profile,
  selectedId,
  search,
  canLink,
}: {
  pane: Pane
  students: MasterStudentListItem[]
  guardians: GuardianWithStudents[]
  profile: MasterStudent | null
  selectedId: string | null
  search: string
  canLink: boolean
}) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pane, setPane] = useState<Pane>(initialPane)

  const onPaneChange = (next: Pane) => {
    setPane(next)
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'guardians') params.set('pane', 'guardians')
    else params.delete('pane')
    // Selection belongs to the other pane, so drop it rather than carrying a
    // learner id across to a guardian list.
    params.delete('id')
    startTransition(() => {
      router.push(`/students?${params.toString()}`)
    })
  }

  const select = (id: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('id', id)
    if (pane === 'guardians') params.set('pane', 'guardians')
    startTransition(() => {
      router.push(`/students?${params.toString()}`)
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      {/* Left pane */}
      <div className="rounded-lg border border-border">
        <div className="flex items-center gap-2 border-b border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Show ${pane === 'students' ? 'guardians' : 'learners'}`}
            onClick={() => onPaneChange(pane === 'students' ? 'guardians' : 'students')}
          >
            <span aria-hidden="true">{pane === 'students' ? '←' : '→'}</span>
          </Button>

          <form method="get" action="/students" className="flex-1">
            <input type="hidden" name="pane" value={pane} />
            <input type="hidden" name="id" value={selectedId ?? ''} />
            <Input
              name="search"
              defaultValue={search}
              placeholder={pane === 'students' ? 'Search learners' : 'Search guardians'}
              className="h-8"
              
            />
          </form>
        </div>

        <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto" role="list">
          {pane === 'students'
            ? students.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => select(s.id)}
                    aria-current={selectedId === s.id ? 'true' : undefined}
                    className={`flex w-full flex-col gap-0.5 p-3 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                      selectedId === s.id ? 'bg-primary-soft' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{s.studentNo}</span>
                      <Badge variant="secondary" className="capitalize">
                        {s.gender}
                      </Badge>
                    </span>
                    <span className="text-sm font-medium">{s.fullName}</span>
                    <span className="text-xs text-muted-foreground">{s.streamLabel ?? 'Unassigned'}</span>
                  </button>
                </li>
              ))
            : guardians.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => select(g.id)}
                    aria-current={selectedId === g.id ? 'true' : undefined}
                    className={`flex w-full flex-col gap-0.5 p-3 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                      selectedId === g.id ? 'bg-primary-soft' : ''
                    }`}
                  >
                    <span className="text-sm font-medium">{g.fullName}</span>
                    <span className="font-mono text-xs text-muted-foreground">{g.phone}</span>
                    <span className="text-xs text-muted-foreground">
                      {g.links.length === 0
                        ? 'No linked learners'
                        : `${g.links.length} linked learner${g.links.length === 1 ? '' : 's'}`}
                    </span>
                  </button>
                </li>
              ))}
        </ul>

        {pane === 'students' && students.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No learners match.</p>
        )}
        {pane === 'guardians' && guardians.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No guardians match.</p>
        )}
      </div>

      {/* Right pane */}
      <div className={`space-y-4 ${pending ? 'opacity-60' : ''}`} aria-busy={pending}>
        {pane === 'students' ? (
          profile ? (
            <StudentProfile profile={profile} />
          ) : (
            <p className="text-sm text-muted-foreground">Select a learner to see their record.</p>
          )
        ) : (
          <GuardianProfile
            guardians={guardians}
            selectedId={selectedId}
            canLink={canLink}
          />
        )}
      </div>
    </div>
  )
}

function StudentProfile({ profile }: { profile: MasterStudent }) {
  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-lg font-semibold">{profile.fullName}</h2>
        <p className="font-mono text-xs text-muted-foreground">{profile.studentNo}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge className="capitalize">{profile.status}</Badge>
          {profile.classLabel && <Badge variant="secondary">{profile.classLabel}</Badge>}
          <Badge variant="outline" className="capitalize">
            {profile.gender}
          </Badge>
        </div>
      </div>

      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Date of birth</dt>
          <dd>{profile.dateOfBirth}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Class admitted</dt>
          <dd>{profile.classLabel ?? 'Not recorded'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">County</dt>
          <dd>{profile.county ?? 'Not recorded'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Phone</dt>
          <dd>{profile.phone ?? 'Not recorded'}</dd>
        </div>
      </dl>

      <div>
        <h3 className="mb-2 text-sm font-medium">Guardians</h3>
        {profile.guardians.length === 0 ? (
          <p className="text-sm text-muted-foreground">No guardian linked yet.</p>
        ) : (
          <ul role="list" className="space-y-2">
            {profile.guardians.map((g) => (
              <li key={g.linkId} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{g.fullName}</span>
                <Badge variant="secondary" className="capitalize">
                  {g.relationship.replace('_', ' ')}
                </Badge>
                {g.isPrimary && <Badge variant="outline">Primary</Badge>}
                {g.isFeePayer && <Badge variant="outline">Fee payer</Badge>}
                <span className="font-mono text-xs text-muted-foreground">{g.phone}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function GuardianProfile({
  guardians,
  selectedId,
  canLink,
}: {
  guardians: GuardianWithStudents[]
  selectedId: string | null
  canLink: boolean
}) {
  const guardian = guardians.find((g) => g.id === selectedId)

  if (!guardian) {
    return <p className="text-sm text-muted-foreground">Select a guardian to see their details.</p>
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-lg font-semibold">{guardian.fullName}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {guardian.relationship && (
            <Badge variant="secondary" className="capitalize">
              {guardian.relationship.replace('_', ' ')}
            </Badge>
          )}
          {guardian.isDeceased && <Badge variant="destructive">Deceased</Badge>}
        </div>
      </div>

      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Phone</dt>
          <dd className="font-mono text-sm">{guardian.phone}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Email</dt>
          <dd className="text-sm">{guardian.email ?? 'Not recorded'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Occupation</dt>
          <dd className="text-sm">{guardian.occupation ?? 'Not recorded'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Address</dt>
          <dd className="text-sm">{guardian.address ?? 'Not recorded'}</dd>
        </div>
        {guardian.isDeceased && guardian.absenceReason && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Absence reason</dt>
            <dd className="text-sm">{guardian.absenceReason}</dd>
          </div>
        )}
      </dl>

      <div>
        <h3 className="mb-2 text-sm font-medium">Linked learners</h3>
        {guardian.links.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No learners linked to this guardian yet.
          </p>
        ) : (
          <ul role="list" className="space-y-2">
            {guardian.links.map((s) => (
              <li
                key={s.linkId}
                className="flex flex-wrap items-center gap-2 rounded-md bg-surface-2 p-2 text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground">{s.studentNo}</span>
                <span className="font-medium">{s.fullName}</span>
                <Badge variant="secondary" className="capitalize">
                  {s.status}
                </Badge>
                <span className="text-xs text-muted-foreground">{s.streamLabel ?? 'Unassigned'}</span>
                {canLink && (
                  <UnlinkButton guardianId={guardian.id} studentId={s.studentId} />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canLink && (
        <LinkStudentDialog
          guardianId={guardian.id}
          guardianName={guardian.fullName}
          resolve={resolveLearner}
        />
      )}
    </div>
  )
}