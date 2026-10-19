import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { RegisterForm } from '@/features/onboarding/components/register-form'
import { signOut } from '@/features/onboarding/actions'
import { createClient } from '@/lib/supabase/server'

// Reads the session from cookies, so this route cannot be prerendered.
export const instant = false

export default async function RegisterPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <main className="mx-auto w-full max-w-3xl p-4 py-10">
      {user && (
        <Alert className="mb-4">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              You are signed in as {user.email} but this account has no school yet. Finish
              setting one up below, or sign out to use a different account.
            </span>
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Register your school</CardTitle>
          <CardDescription>
            Three terms per academic year, Competency-Based Curriculum, Kenyan reporting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegisterForm />
        </CardContent>
      </Card>
    </main>
  )
}