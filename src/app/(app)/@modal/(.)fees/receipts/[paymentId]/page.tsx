import { notFound } from 'next/navigation'
import { RouteDialog } from '@/components/shared/route-dialog'
import { requirePermission } from '@/lib/auth/guards'
import { getReceipt } from '@/features/fees/queries'
import { ReceiptView } from '@/features/fees/components/receipt-view'

export const instant = false

/** A receipt opened from a list: the same view as /fees/receipts/[id], in a modal. */
export default async function ReceiptModal({ params }: { params: Promise<{ paymentId: string }> }) {
  await requirePermission('fee.view')
  const { paymentId } = await params

  const receipt = await getReceipt(paymentId)
  if (!receipt) notFound()

  return (
    <RouteDialog title="Payment Receipt" className="max-w-xl">
      <ReceiptView receipt={receipt} showBack={false} />
    </RouteDialog>
  )
}
