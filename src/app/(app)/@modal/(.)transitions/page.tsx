import { RouteDialog } from '@/components/shared/route-dialog'
import { TransitionsScreen } from '@/features/transitions/components/transitions-screen'

export const instant = false

/** Transitions opened from the menu: the same screen as /transitions, in a modal. */
export default function TransitionsModal() {
  return (
    <RouteDialog
      title="Transitions"
      description="Terms, academic years and end-of-year promotion."
    >
      <TransitionsScreen />
    </RouteDialog>
  )
}
