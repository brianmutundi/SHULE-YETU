'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { BioTab } from './record-tab-bio'
import { FamilyTab } from './record-tab-family'
import { AcademicTab } from './record-tab-academic'
import { MedicalTab } from './record-tab-medical'
import { LogisticsTab } from './record-tab-logistics'
import { ComplianceTab } from './record-tab-compliance'
import type { StudentRecord } from '../record-queries'

/**
 * Full Student Record (section 7.7).
 *
 * Tab state is local rather than in the URL because the record is opened from a
 * selection already carried in the URL; keeping the tab local avoids nesting one
 * selection inside another.
 */

type TabId =
  | 'bio'
  | 'family'
  | 'academic'
  | 'medical'
  | 'logistics'
  | 'compliance'

export function StudentRecordView({
  student,
  operatingMode,
  canEdit,
  canManageGuardians,
  features,
}: {
  student: StudentRecord
  operatingMode: 'basic' | 'senior'
  canEdit: boolean
  canManageGuardians: boolean
  features: { boarding: boolean }
}) {
  const [tab, setTab] = useState<TabId>('bio')

  const tabs: { id: TabId; label: string }[] = [
    { id: 'bio', label: 'Bio and admission' },
    { id: 'family', label: 'Family and contact' },
    { id: 'academic', label: 'Academic' },
    { id: 'medical', label: 'Medical' },
    { id: 'logistics', label: 'Logistics and finance' },
    { id: 'compliance', label: 'Docs and compliance' },
  ]

  return (
    <div className="space-y-6">
      <header className="rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-start gap-4">
          <span
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground"
          >
            {student.firstName.charAt(0).toUpperCase()}
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{student.fullName}</h1>
            <p className="font-mono text-sm text-muted-foreground">{student.studentNo}</p>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant={student.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                {student.status}
              </Badge>
              {student.classLabel && (
                <Badge variant="secondary">
                  {student.classLabel}
                  {student.streamLabel ? ` ${student.streamLabel}` : ''}
                </Badge>
              )}
              <Badge variant="outline" className="capitalize">
                {student.gender}
              </Badge>
              {student.pathwayCode && (
                <Badge variant="outline">
                  {student.pathwayName} ({student.pathwayCode})
                </Badge>
              )}
              {student.tuitionWaiver && <Badge variant="outline">Tuition waiver</Badge>}
            </div>
          </div>

          <dl className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-1">
            <div>
              <dt className="text-xs text-muted-foreground">Attendance this term</dt>
              <dd className="text-muted-foreground">Not recorded yet</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Balance</dt>
              <dd className="text-muted-foreground">Not invoiced yet</dd>
            </div>
          </dl>
        </div>
      </header>

      <div role="tablist" aria-label="Student record sections" className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              tab === t.id
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
        className="rounded-lg border border-border p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {tab === 'bio' && <BioTab student={student} canEdit={canEdit} />}
        {tab === 'family' && <FamilyTab student={student} canLink={canManageGuardians} />}
        {tab === 'academic' && <AcademicTab student={student} operatingMode={operatingMode} />}
        {tab === 'medical' && <MedicalTab student={student} canEdit={canEdit} />}
        {tab === 'logistics' && (
          <LogisticsTab student={student} canEdit={canEdit} features={features} />
        )}
        {tab === 'compliance' && <ComplianceTab student={student} canEdit={canEdit} />}
      </div>
    </div>
  )
}