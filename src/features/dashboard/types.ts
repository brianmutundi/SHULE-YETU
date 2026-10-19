export interface Kpis {
  schoolName: string
  logoUrl: string | null
  students: number
  staff: number
  /** False for roles that may not see money. */
  finance: boolean
  /** Minor units; null when finance is false. */
  expected: number | null
  accrued: number | null
}

export interface PopulationRow {
  classLabel: string
  boys: number
  girls: number
}

export interface BreakdownRow {
  label: string
  value: number
}

export interface DebtorRow {
  label: string
  debtors: number
  owed: number
}

export interface SeriesPoint {
  bucket: string
  total: number
  entryCount: number
}

export interface TransactionItem {
  paymentId: string
  receiptNo: string
  amount: number
  method: string
  status: string
  reversesPaymentId: string | null
  paidAt: string
  studentNo: string
  studentName: string
  class: string | null
  balance: number
}

export interface Transactions {
  count: number
  total: number
  items: TransactionItem[]
}
