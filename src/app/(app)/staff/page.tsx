import { getSessionContext } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import { getStaffDirectory } from '@/features/staff/queries'
import { staffDirectorySchema } from '@/features/staff/schema'
import { StaffDirectoryView } from '@/features/staff/components/staff-directory-view'

// Auth-dependent, so it cannot be prerendered.
export const instant = false

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getSessionContext()
  const raw = await searchParams

  const parsed = staffDirectorySchema.safeParse({
    search: typeof raw.search === 'string' ? raw.search : undefined,
    staffType: typeof raw.staffType === 'string' ? raw.staffType : undefined,
    employer: typeof raw.employer === 'string' ? raw.employer : undefined,
    status: typeof raw.status === 'string' ? raw.status : undefined,
  })

  const filters = parsed.success
    ? parsed.data
    : { search: '', staffType: 'all' as const, employer: 'all' as const, status: 'all' as const }

  const result = await getStaffDirectory(filters)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
        <p className="text-muted-foreground">
          Teaching and non-teaching staff, employer and teaching assignments.
        </p>
      </div>

      <StaffDirectoryView
        rows={result.rows}
        stats={result.stats}
        canSeeSensitive={result.canSeeSensitive}
        canManage={can(session.role, 'staff.manage')}
        filters={{
          search: filters.search ?? '',
          staffType: filters.staffType,
          employer: filters.employer,
          status: filters.status,
        }}
      />
    </div>
  )
}