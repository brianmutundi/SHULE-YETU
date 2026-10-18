import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getSessionContext } from '@/lib/auth/session'
import { getClassesForSchoolType } from '@/lib/school-type'

// Resolves the session from cookies, so this route cannot be prerendered.
export const instant = false

export default async function HomePage() {
  const session = await getSessionContext()
  const classes = getClassesForSchoolType(session.schoolType)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {session.fullName ? `Welcome, ${session.fullName}` : session.tenantName}
        </h1>
        <p className="text-muted-foreground">
          {session.schoolTypeDefinition.label} · {session.operatingMode} mode · signed in as{' '}
          {session.role}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Students', value: '—' },
          { label: 'Staff', value: '—' },
          { label: 'Expected fees', value: '—' },
          { label: 'Collected fees', value: '—' },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Classes set up for this school</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-wrap items-center gap-2 text-sm">
            {classes.map((label, index) => (
              <li key={label} className="flex items-center gap-2">
                <span className="rounded-md bg-surface-2 px-2 py-1">{label}</span>
                {index < classes.length - 1 && (
                  <span aria-hidden="true" className="text-muted-foreground">
                    →
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted-foreground">
            Dashboard widgets, mark entry and reports arrive in later phases. This view confirms
            onboarding seeded the right structure.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}