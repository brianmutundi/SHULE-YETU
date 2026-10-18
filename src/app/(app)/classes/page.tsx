import { ClassesScreen } from '@/features/classes/components/classes-screen'

export const instant = false

export default function ClassesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Classes and streams</h1>
      <ClassesScreen />
    </div>
  )
}
