import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'
import type { ReportData } from '../queries'
import { bandFor, gradeBand } from '../schema'

/**
 * Report card (CLAUDE.md section 7.13 and 7.15).
 *
 * Rendered server-side with @react-pdf/renderer. The layout follows what a
 * Kenyan report card carries: school header, learner and class, the results
 * table, a competence summary, attendance, and signature lines for the class
 * teacher and head teacher.
 *
 * Deliberately not a screenshot of the screen. A report card is a document the
 * learner takes home, so it has to print cleanly on whatever paper the school
 * has, and it has to stand alone six months later.
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 40,
    paddingHorizontal: 32,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#111',
  },
  header: {
    textAlign: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: '#7c3aed',
    paddingBottom: 8,
    marginBottom: 10,
  },
  schoolName: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  schoolMeta: { fontSize: 8, color: '#444' },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  title: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  period: { fontSize: 9, color: '#333' },

  identity: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: '#d4d4d8',
    marginBottom: 10,
  },
  identityCell: {
    width: '50%',
    paddingVertical: 4,
    paddingHorizontal: 6,
    flexDirection: 'row',
  },
  identityLabel: { width: 68, color: '#555' },
  identityValue: { flex: 1, fontFamily: 'Helvetica-Bold' },

  table: { borderWidth: 1, borderColor: '#d4d4d8', marginBottom: 10 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e4e4e7' },
  tableRowLast: { flexDirection: 'row' },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: '#f4f4f5',
    borderBottomWidth: 1,
    borderBottomColor: '#d4d4d8',
  },
  cell: { paddingVertical: 4, paddingHorizontal: 6 },
  headCell: { paddingVertical: 4, paddingHorizontal: 6, fontFamily: 'Helvetica-Bold', fontSize: 8 },

  colArea: { width: '34%' },
  colTask: { width: '30%' },
  colResult: { width: '18%' },
  colScore: { width: '18%', textAlign: 'right' },

  summary: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  summaryBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d4d4d8',
    padding: 6,
  },
  summaryLabel: { fontSize: 8, color: '#555', marginBottom: 3 },
  summaryValue: { fontFamily: 'Helvetica-Bold', fontSize: 11 },

  attendance: {
    borderWidth: 1,
    borderColor: '#d4d4d8',
    padding: 6,
    marginBottom: 10,
  },
  attendanceRow: { flexDirection: 'row', justifyContent: 'space-between' },

  comments: {
    borderWidth: 1,
    borderColor: '#d4d4d8',
    padding: 6,
    marginBottom: 14,
    minHeight: 54,
  },
  commentsLabel: { fontSize: 8, color: '#555', marginBottom: 3 },

  signatures: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  signature: { width: '42%' },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: '#111',
    marginBottom: 3,
    marginTop: 22,
  },
  signatureLabel: { fontSize: 8, color: '#444' },

  footer: {
    position: 'absolute',
    bottom: 18,
    left: 32,
    right: 32,
    textAlign: 'center',
    fontSize: 7,
    color: '#777',
    borderTopWidth: 1,
    borderTopColor: '#e4e4e7',
    paddingTop: 4,
  },
  empty: { padding: 12, textAlign: 'center', color: '#666' },
})

export interface ReportCardProps {
  schoolName: string
  address: string
  phone: string | null
  email: string | null
  data: ReportData
  /** Next term's opening date, when one is known. */
  nextTermOpens: string | null
  mode: 'basic' | 'senior'
  /** Fee balance note, once fees exist (Phase 11). */
  feeNote: string | null
}

export function ReportCardDocument(props: ReportCardProps) {
  const { data, mode } = props
  const isBasic = mode === 'basic'

  // Competence summary for basic mode: how many at each band. A school reads
  // this first, and it is the one thing a level list cannot tell them at a
  // glance.
  const bands = data.lines.reduce<Record<string, number>>((acc, line) => {
    if (!line.code) return acc
    const band = bandFor(line.code)
    if (band) acc[band] = (acc[band] ?? 0) + 1
    return acc
  }, {})

  // Senior mode: the weighted average, with the count it rests on shown, since
  // a mean over two results is not the same claim as one over thirty.
  const percentages = data.lines
    .filter((l) => l.score !== null)
    .map((l) => ((l.score as number) / (l.maxScore || 100)) * 100)
  const average =
    percentages.length > 0
      ? Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 10) / 10
      : null

  return (
    <Document
      title={`Report card ${data.admissionNo} ${data.termName} ${data.calendarYear}`}
      author={props.schoolName}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.schoolName}>{props.schoolName.toUpperCase()}</Text>
          {props.address && <Text style={styles.schoolMeta}>{props.address}</Text>}
          <Text style={styles.schoolMeta}>
            {[props.phone, props.email].filter(Boolean).join('  |  ')}
          </Text>
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>END OF TERM REPORT CARD</Text>
          <Text style={styles.period}>
            {data.termName} &middot; {data.calendarYear}
          </Text>
        </View>

        <View style={styles.identity}>
          <View style={styles.identityCell}>
            <Text style={styles.identityLabel}>Name:</Text>
            <Text style={styles.identityValue}>{data.studentName}</Text>
          </View>
          <View style={styles.identityCell}>
            <Text style={styles.identityLabel}>Admission No:</Text>
            <Text style={styles.identityValue}>{data.admissionNo}</Text>
          </View>
          <View style={styles.identityCell}>
            <Text style={styles.identityLabel}>Class:</Text>
            <Text style={styles.identityValue}>
              {[data.classLabel, data.streamLabel].filter(Boolean).join(' ')}
            </Text>
          </View>
          <View style={styles.identityCell}>
            <Text style={styles.identityLabel}>Position:</Text>
            <Text style={styles.identityValue}>{' '}</Text>
          </View>
        </View>

        {data.lines.length === 0 ? (
          <View style={styles.table}>
            <Text style={styles.empty}>
              No results have been recorded for this term yet.
            </Text>
          </View>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={[styles.headCell, styles.colArea]}>
                {isBasic ? 'Learning area' : 'Subject'}
              </Text>
              <Text style={[styles.headCell, styles.colTask]}>Assessment</Text>
              <Text style={[styles.headCell, styles.colResult]}>
                {isBasic ? 'Level' : 'Score'}
              </Text>
              <Text style={[styles.headCell, styles.colScore]}>
                {isBasic ? 'Points' : 'Grade'}
              </Text>
            </View>

            {data.lines.map((line, index) => {
              const percentage =
                line.score !== null ? ((line.score / (line.maxScore || 100)) * 100) : null

              return (
                <View
                  key={line.key}
                  style={index === data.lines.length - 1 ? styles.tableRowLast : styles.tableRow}
                >
                  <Text style={[styles.cell, styles.colArea]}>{line.label}</Text>
                  <Text style={[styles.cell, styles.colTask]}>{line.detail ?? ''}</Text>
                  <Text style={[styles.cell, styles.colResult]}>
                    {line.code ?? (line.score !== null ? String(line.score) : '-')}
                  </Text>
                  <Text style={[styles.cell, styles.colScore]}>
                    {line.points ?? (percentage !== null ? gradeBand(percentage) : '-')}
                  </Text>
                </View>
              )
            })}
          </View>
        )}

        {isBasic && data.lines.length > 0 && (
          <View style={styles.summary}>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Exceeds expectation</Text>
              <Text style={styles.summaryValue}>{bands.exceeds ?? 0}</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Meets expectation</Text>
              <Text style={styles.summaryValue}>{bands.meets ?? 0}</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Below expectation</Text>
              <Text style={styles.summaryValue}>{bands.below ?? 0}</Text>
            </View>
          </View>
        )}

        {!isBasic && average !== null && (
          <View style={styles.summary}>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Average</Text>
              <Text style={styles.summaryValue}>{average}%</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Grade</Text>
              <Text style={styles.summaryValue}>{gradeBand(average)}</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Results counted</Text>
              <Text style={styles.summaryValue}>{percentages.length}</Text>
            </View>
          </View>
        )}

        <View style={styles.attendance}>
          <Text style={styles.summaryLabel}>Attendance this term</Text>
          <View style={styles.attendanceRow}>
            <Text>
              Present {data.attendance.present} &nbsp; Late {data.attendance.late} &nbsp; Absent{' '}
              {data.attendance.absent} &nbsp; Excused {data.attendance.excused}
            </Text>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>
              {data.attendance.rate === null ? 'No record' : `${data.attendance.rate}%`}
            </Text>
          </View>
          {props.feeNote && (
            <Text style={{ marginTop: 4, color: '#444' }}>{props.feeNote}</Text>
          )}
        </View>

        <View style={styles.comments}>
          <Text style={styles.commentsLabel}>Class teacher&apos;s comments</Text>
          <Text>{' '}</Text>
        </View>

        <View style={styles.signatures}>
          <View style={styles.signature}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Class teacher</Text>
          </View>
          <View style={styles.signature}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Head teacher</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            {props.nextTermOpens
              ? `Next term opens on ${props.nextTermOpens}.`
              : 'Keep this card safe; it is your record of the term.'}
          </Text>
        </View>
      </Page>
    </Document>
  )
}