import { getSessionContext } from '@/lib/auth/session'
import { getClassesForSchoolType, getExitCheckpoints } from '@/lib/school-type'
import { canViewSensitiveFinance } from '@/lib/auth/permissions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const instant = false

/**
 * School profile. School type is shown read-only (CLAUDE.md section 4A):
 * changing it after students exist needs a separately approved audited
 * migration path, and the database refuses the update regardless.
 */
export default async function SettingsPage() {
  const session = await getSessionContext()
  const supabase = await import('@/lib/supabase/server').then((m) => m.createClient())

  const { data: tenant } = await supabase
    .from('tenants')
    .select(
      'name, school_type, ownership, boarding_mode, gender, sponsor, county, sub_county, school_code, knec_center_code, capitation_enabled, currency, timezone',
    )
    .eq('id', session.tenantId)
    .single()

  const classes = getClassesForSchoolType(session.schoolType)
  const checkpoints = getExitCheckpoints(session.schoolType)

  const details: [string, string | null | undefined][] = [
    ['School name', tenant?.name],
    ['County', tenant?.county],
    ['Sub-county', tenant?.sub_county],
    ['Ownership', tenant?.ownership],
    ['Day / boarding', tenant?.boarding_mode],
    ['Boys / girls', tenant?.gender],
    ['Sponsor', tenant?.sponsor],
    ['School code', tenant?.school_code],
    ['KNEC centre code', tenant?.knec_center_code],
    ['Currency', tenant?.currency],
    ['Timezone', tenant?.timezone],
    ['Capitation', tenant?.capitation_enabled ? 'Enabled (public school)' : 'Not enabled'],
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">School profile</h1>
        <p className="text-muted-foreground">
          Signed in as {session.fullName ?? session.email} ({session.role})
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">School type</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Fixed when the school was registered. Changing it requires a reviewed data migration.
            </p>
          </div>
          <Badge>{session.schoolTypeDefinition.label}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Operating mode</dt>
              <dd className="font-medium">
                {session.operatingMode === 'senior' ? 'Senior' : 'Basic'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Exit assessment</dt>
              <dd className="font-medium">
                {checkpoints.length > 0 ? checkpoints.join(' and ') : 'None'}
              </dd>
            </div>
          </dl>

          <div>
            <p className="text-sm text-muted-foreground">Class chain</p>
            <ol className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              {classes.map((label, index) => (
                <li key={label} className="flex items-center gap-2">
                  <span className="rounded-md bg-surface-2 px-2 py-1">{label}</span>
                  {index < classes.length - 1 && (
                    <span aria-hidden="true" className="text-muted-foreground">
                      &rarr;
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value || '-'}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-muted-foreground">
            Sensitive identifiers (KRA PIN, NSSF/SHA, national ID) are visible to{' '}
            {canViewSensitiveFinance(session.role) ? 'your role' : 'owner, admin and finance only'}.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}