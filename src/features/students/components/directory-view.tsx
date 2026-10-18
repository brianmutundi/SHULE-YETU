import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DirectoryResult, FilterOptions, StudentRow } from '../queries'

const PAGE_SIZE = 25

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  draft: 'secondary',
  inactive: 'outline',
  graduated: 'default',
  completed: 'default',
  transferred: 'secondary',
  withdrawn: 'destructive',
}

function StudentLine({ student }: { student: StudentRow }) {
  return (
    <tr>
      <td className="px-4 py-2 font-mono text-xs">{student.studentNo}</td>
      <td className="px-4 py-2 font-medium">{student.fullName}</td>
      <td className="px-4 py-2 capitalize text-muted-foreground">{student.gender}</td>
      <td className="px-4 py-2 text-muted-foreground">{student.streamLabel ?? 'Unassigned'}</td>
      <td className="px-4 py-2">{student.dateOfBirth}</td>
      <td className="px-4 py-2">
        <Badge variant={STATUS_VARIANT[student.status] ?? 'secondary'} className="capitalize">
          {student.status}
        </Badge>
      </td>
      <td className="px-4 py-2 text-right">
        {/* Full Student Record arrives in Phase 6. */}
        <span className="text-xs text-muted-foreground">Phase 6</span>
      </td>
    </tr>
  )
}

export function DirectoryView({
  result,
  filters,
  options,
}: {
  result: DirectoryResult
  filters: { search: string; status: string; gender: string; streamId: string; page: number }
  options: FilterOptions
}) {
  const { stats, rows, total } = result
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const pageLink = (page: number) => {
    const params = new URLSearchParams()
    if (filters.search) params.set('search', filters.search)
    if (filters.status !== 'all') params.set('status', filters.status)
    if (filters.gender !== 'all') params.set('gender', filters.gender)
    if (filters.streamId) params.set('streamId', filters.streamId)
    params.set('page', String(page))
    return `/students/directory?${params.toString()}`
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Active" value={stats.active} />
        <StatCard label="Inactive" value={stats.inactive} />
        <StatCard
          label="Gender ratio"
          value={`${stats.male} / ${stats.female}`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Graduated" value={stats.graduated} />
        <StatCard label="Completed this level" value={stats.completed} />
        <StatCard label="New this term" value={stats.newThisTerm} />
        <StatCard label="Matching filters" value={total} />
      </div>

      <form method="get" action="/students/directory" className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="search" className="text-xs text-muted-foreground">
            Search
          </label>
          <input
            id="search"
            name="search"
            type="search"
            defaultValue={filters.search}
            placeholder="Name or admission number"
            className="h-8 w-56 rounded-md border border-border bg-transparent px-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="status" className="text-xs text-muted-foreground">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={filters.status}
            className="h-8 rounded-md border border-border bg-transparent px-2 text-sm"
          >
            {['all', 'active', 'draft', 'inactive', 'completed', 'graduated', 'transferred', 'withdrawn'].map(
              (s) => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All statuses' : s}
                </option>
              ),
            )}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="gender" className="text-xs text-muted-foreground">
            Gender
          </label>
          <select
            id="gender"
            name="gender"
            defaultValue={filters.gender}
            className="h-8 rounded-md border border-border bg-transparent px-2 text-sm"
          >
            {['all', 'male', 'female'].map((g) => (
              <option key={g} value={g}>
                {g === 'all' ? 'All' : g}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="streamId" className="text-xs text-muted-foreground">
            Stream
          </label>
          <select
            id="streamId"
            name="streamId"
            defaultValue={filters.streamId}
            className="h-8 rounded-md border border-border bg-transparent px-2 text-sm"
          >
            <option value="">All streams</option>
            {options.streams.map((s) => {
              const cls = options.classes.find((c) => c.id === s.classId)
              return (
                <option key={s.id} value={s.id}>
                  {cls ? `${cls.label} ${s.label}` : s.label}
                </option>
              )
            })}
          </select>
        </div>

        <button
          type="submit"
          className="h-8 rounded-md bg-primary px-3 text-sm text-primary-foreground"
        >
          Apply
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">Learner directory</caption>
          <thead className="border-b border-border bg-surface-2 text-left">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Admission no.</th>
              <th scope="col" className="px-4 py-2 font-medium">Name</th>
              <th scope="col" className="px-4 py-2 font-medium">Gender</th>
              <th scope="col" className="px-4 py-2 font-medium">Class</th>
              <th scope="col" className="px-4 py-2 font-medium">Date of birth</th>
              <th scope="col" className="px-4 py-2 font-medium">Status</th>
              <th scope="col" className="px-4 py-2 font-medium">Record</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No learners match these filters.
                </td>
              </tr>
            ) : (
              rows.map((student) => <StudentLine key={student.id} student={student} />)
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center justify-between" aria-label="Pagination">
          <p className="text-sm text-muted-foreground">
            Page {result.page} of {totalPages} ({total} learners)
          </p>
          <div className="flex gap-2">
            {result.page > 1 && (
              <Link
                href={pageLink(result.page - 1)}
                className="rounded-md border border-border px-3 py-1 text-sm"
              >
                Previous
              </Link>
            )}
            {result.page < totalPages && (
              <Link
                href={pageLink(result.page + 1)}
                className="rounded-md border border-border px-3 py-1 text-sm"
              >
                Next
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  )
}