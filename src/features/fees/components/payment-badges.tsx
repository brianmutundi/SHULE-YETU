import { Chip } from '@/components/shared/chip'
import { entryKind, type EntryKind } from '../schema'

/** "Reversal" on the negative entry, "Reversed" on the payment it cancelled. */
export function EntryBadge({
  status,
  reversesPaymentId,
}: {
  status: string
  reversesPaymentId: string | null
}) {
  const kind: EntryKind = entryKind({ status, reversesPaymentId })
  if (kind === 'payment') return null
  return <Chip tone="warning">{kind === 'reversal' ? 'Reversal' : 'Reversed'}</Chip>
}
