import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth/guards'
import { getReceipt } from '@/features/fees/queries'
import { ReceiptView } from '@/features/fees/components/receipt-view'

export const instant = false

export default async function ReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  await requirePermission('fee.view')
  const { paymentId } = await params

  // A receipt from another school is "not found", not "forbidden".
  const receipt = await getReceipt(paymentId)
  if (!receipt) notFound()

  return <ReceiptView receipt={receipt} />
}
