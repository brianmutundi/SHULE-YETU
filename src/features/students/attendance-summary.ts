export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'

export interface AttendanceRecordLite {
  /** yyyy-MM-dd */
  date: string
  status: AttendanceStatus
}

export interface AttendanceSummary {
  markedDays: number
  absentDays: number
  /** Whole percent of counted days attended, or null when nothing is counted. */
  ratePct: number | null
  /** yyyy-MM-dd of the most recent absence, or null. */
  lastAbsent: string | null
}

/**
 * Attendance for the profile bar.
 *
 * Present and late count as attended. Excused days are left out of the
 * denominator so a sick day does not lower the rate. CLAUDE.md [A7] leaves the
 * thresholds and rate rule unconfirmed, so this is the default, not a ruling.
 */
export function summarizeAttendance(records: AttendanceRecordLite[]): AttendanceSummary {
  let attended = 0
  let counted = 0
  let absentDays = 0
  let lastAbsent: string | null = null

  for (const record of records) {
    if (record.status === 'excused') continue
    counted += 1
    if (record.status === 'absent') {
      absentDays += 1
      if (lastAbsent === null || record.date > lastAbsent) lastAbsent = record.date
    } else {
      attended += 1
    }
  }

  return {
    markedDays: records.length,
    absentDays,
    ratePct: counted === 0 ? null : Math.round((attended / counted) * 100),
    lastAbsent,
  }
}
