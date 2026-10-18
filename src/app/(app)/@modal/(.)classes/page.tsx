import { RouteDialog } from '@/components/shared/route-dialog'
import { ClassesScreen } from '@/features/classes/components/classes-screen'

export const instant = false

/** Classes opened from the menu: the same screen as /classes, in a modal. */
export default function ClassesModal() {
  return (
    <RouteDialog title="Classes and streams">
      <ClassesScreen />
    </RouteDialog>
  )
}
