import { Badge } from '@/components/ui/badge'
import type { OperatingMode } from '@/lib/school-type'

/**
 * The session badge. Academic year and term land here in Phase 2; for now it
 * carries the school type, which is the context everything else is filtered by.
 */
export function SessionBadge({
  schoolTypeLabel,
  mode,
}: {
  schoolTypeLabel: string
  mode: OperatingMode
}) {
  return (
    <Badge variant="secondary" className="gap-1.5">
      <span>{schoolTypeLabel}</span>
      <span aria-hidden="true" className="text-muted-foreground">
        ·
      </span>
      <span className="text-muted-foreground">{mode === 'senior' ? 'Senior mode' : 'Basic mode'}</span>
    </Badge>
  )
}