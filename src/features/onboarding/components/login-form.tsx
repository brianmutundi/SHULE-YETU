'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { signIn } from '@/features/onboarding/actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in'}
    </Button>
  )
}

export function LoginForm() {
  const [state, formAction] = useActionState(signIn, null)

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state && !state.ok && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-describedby={state?.ok === false ? 'login-error' : undefined}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>

      <SubmitButton />

      <p className="text-center text-sm text-muted-foreground">
        Setting up a new school?{' '}
        <Link href="/register" className="text-primary underline underline-offset-4">
          Register your school
        </Link>
      </p>
    </form>
  )
}