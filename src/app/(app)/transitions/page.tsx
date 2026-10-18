import { TransitionsScreen } from '@/features/transitions/components/transitions-screen'

// Auth-dependent, so it cannot be prerendered.
export const instant = false

export default function TransitionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Transitions</h1>
        <p className="text-muted-foreground">Terms, academic years and end-of-year promotion.</p>
      </div>
      <TransitionsScreen />
    </div>
  )
}
