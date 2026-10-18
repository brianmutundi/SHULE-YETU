import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RegisterForm } from '@/features/onboarding/components/register-form'

export default function RegisterPage() {
  return (
    <main className="mx-auto w-full max-w-3xl p-4 py-10">
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