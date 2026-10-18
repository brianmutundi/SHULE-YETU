'use client'

import { useState, useActionState } from 'react'
import { MarksGrid } from '@/features/assessments/components/marks-grid'
import { createTask } from '@/features/assessments/actions'

interface AssessmentsClientProps {
  session: import('@/lib/auth/session').SessionContext
  period: import('@/lib/auth/period').AcademicPeriod | null
  rubric: import('@/features/assessments/schema').PerformanceLevel[]
  areas: import('@/features/assessments/queries').AreaOption[]
  subjects: import('@/features/assessments/queries').SubjectOption[]
  streams: import('@/features/assessments/queries').StreamOption[]
  tasks: import('@/features/assessments/queries').TaskOption[]
  canManage: boolean
  canIssue: boolean
}

export function AssessmentsClient({
  session,
  period,
  rubric,
  areas,
  subjects,
  streams,
  tasks,
}: AssessmentsClientProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assessments</h1>
        <p className="text-muted-foreground">
          {period ? `Term: ${period.termName} · Year: ${period.calendarYear}` : 'No active term'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <section className="space-y-6">
          <h2 className="text-sm font-semibold">Rubric</h2>
          <div className="flex flex-wrap gap-1.5">
            {rubric.map((level: import('@/features/assessments/schema').PerformanceLevel) => (
              <span
                key={level.code}
                title={level.descriptor ?? ''}
                className="rounded-full border px-2.5 py-0.5 text-xs font-medium"
              >
                {level.code} ({level.points})
              </span>
            ))}
          </div>

          <h2 className="text-sm font-semibold">Create assessment</h2>
          <AssessmentTaskForm
            mode={session.operatingMode}
            areas={areas}
            subjects={subjects}
          />
        </section>

        <section className="space-y-6">
          <h2 className="text-sm font-semibold">Assessments</h2>
          <TaskList tasks={tasks} />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <section className="space-y-6">
          <h2 className="text-sm font-semibold">Marks entry</h2>
          <MarksEntrySection
            mode={session.operatingMode}
            streams={streams}
            rubric={(() => { const result: import('@/features/assessments/schema').PerformanceLevel[] = []; for (const l of rubric) { result.push({ id: l.id, code: l.code, points: Number(l.points), scale: l.scale, descriptor: l.descriptor, sortOrder: l.sortOrder }); } return result; })()}
            initialTasks={tasks}
          />
        </section>

        <section className="space-y-6">
          <h2 className="text-sm font-semibold">Report cards</h2>
          <ReportCardSection streams={streams} />
        </section>
      </div>
    </div>
  )
}

function MarksEntrySection({ mode, streams, rubric, initialTasks }: { mode: 'basic' | 'senior'; streams: { id: string; label: string }[]; rubric: { id: string; code: string; points: number; scale: 'eight_point' | 'four_point'; descriptor: string | null; sortOrder: number }[]; initialTasks: { id: string; name: string; category: string }[] }) {
  const [taskId, setTaskId] = useState<string>('')
  const [streamId, setStreamId] = useState<string>('')

  const handleTaskChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    setTaskId(id)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="taskId" className="text-xs text-muted-foreground">Assessment</label>
          <select
            id="taskId"
            value={taskId}
            onChange={handleTaskChange}
            className="h-9 rounded-md border border-border bg-transparent px-2 text-sm"
          >
            <option value="">Select an assessment</option>
            {initialTasks.map((t: { id: string; name: string; category: string }) => (
              <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="streamId" className="text-xs text-muted-foreground">Class</label>
          <select
            id="streamId"
            value={streamId}
            onChange={(e) => setStreamId(e.target.value)}
            className="h-9 rounded-md border border-border bg-transparent px-2 text-sm"
          >
            <option value="">Select a class</option>
            {streams.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {taskId && streamId && (
        <MarksGrid
          taskId={taskId}
          streamId={streamId}
          rows={[]}
          rubric={rubric}
          maxScore={null}
          mode={mode}
        />
      )}
    </div>
  )
}

function ReportCardSection({ streams }: { streams: { id: string; label: string }[] }) {
  const [selectedStream, setSelectedStream] = useState<string>('')
  const [selectedSession, setSelectedSession] = useState<string>('')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="sessionId" className="text-xs text-muted-foreground">Term</label>
          <select
            id="sessionId"
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="h-9 rounded-md border border-border bg-transparent px-2 text-sm"
          >
            <option value="">Select a term</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="streamId" className="text-xs text-muted-foreground">Class</label>
          <select
            id="streamId"
            value={selectedStream}
            onChange={(e) => setSelectedStream(e.target.value)}
            className="h-9 rounded-md border border-border bg-transparent px-2 text-sm"
          >
            <option value="">Select a class</option>
            {streams.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
        <button className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground" disabled={!selectedStream || !selectedSession}>
          Generate report cards
        </button>
      </div>
    </div>
  )
}

function AssessmentTaskForm({ mode, areas, subjects }: {
  mode: 'basic' | 'senior'
  areas: { id: string; name: string }[]
  subjects: { id: string; code: string; name: string }[]
}) {
  const [state, action] = useActionState<TaskResult | null, FormData>(createTask, null)

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="name" className="text-xs text-muted-foreground">Name</label>
          <input id="name" name="name" required className="h-9 rounded-md border border-border bg-transparent px-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label htmlFor="category" className="text-xs text-muted-foreground">Category</label>
          <select id="category" name="category" className="h-9 rounded-md border border-border bg-transparent px-2 text-sm">
            {mode === 'basic' ? (
              <>
                <option value="formative">Formative</option>
                <option value="summative">Summative</option>
              </>
            ) : (
              <>
                <option value="continuous">Continuous</option>
                <option value="end_of_term">End of term</option>
                <option value="culminating">Culminating</option>
              </>
            )}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="sessionId" className="text-xs text-muted-foreground">Term</label>
          <select id="sessionId" name="sessionId" className="h-9 rounded-md border border-border bg-transparent px-2 text-sm">
            <option value="">Select term</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="academicYearId" className="text-xs text-muted-foreground">Academic year</label>
          <select id="academicYearId" name="academicYearId" className="h-9 rounded-md border border-border bg-transparent px-2 text-sm">
            <option value="">Select year</option>
          </select>
        </div>

        {mode === 'basic' ? (
          <div className="space-y-1">
            <label htmlFor="learningAreaId" className="text-xs text-muted-foreground">Learning area</label>
            <select id="learningAreaId" name="learningAreaId" className="h-9 rounded-md border border-border bg-transparent px-2 text-sm">
              <option value="">Select learning area</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="space-y-1">
            <label htmlFor="subjectId" className="text-xs text-muted-foreground">Subject</label>
            <select id="subjectId" name="subjectId" className="h-9 rounded-md border border-border bg-transparent px-2 text-sm">
              <option value="">Select subject</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}
            </select>
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="maxScore" className="text-xs text-muted-foreground">Max score</label>
          <input id="maxScore" name="maxScore" type="number" className="h-9 rounded-md border border-border bg-transparent px-2 text-sm" />
        </div>

        <div className="space-y-1">
          <label htmlFor="weight" className="text-xs text-muted-foreground">Weight (%)</label>
          <input id="weight" name="weight" type="number" min={1} max={100} className="h-9 rounded-md border border-border bg-transparent px-2 text-sm" />
        </div>
      </div>

      <button type="submit" className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground">
        Create assessment
      </button>

      {state && !state.ok && <div className="text-sm text-destructive">{state.error}</div>}
      {state?.ok && <div className="text-sm text-muted-foreground">Created.</div>}
    </form>
  )
}

function TaskList({ tasks }: { tasks: { id: string; name: string; category: string; subjectCode: string | null; learningAreaName: string | null; maxScore: number | null; weight: number | null; gradedCount: number }[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">Assessments for this school</caption>
        <thead className="border-b border-border bg-surface-2 text-left">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Name</th>
            <th scope="col" className="px-3 py-2 font-medium">Category</th>
            <th scope="col" className="px-3 py-2 font-medium">Subject / Area</th>
            <th scope="col" className="px-3 py-2 font-medium">Max score</th>
            <th scope="col" className="px-3 py-2 font-medium">Weight</th>
            <th scope="col" className="px-3 py-2 font-medium">Graded</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {tasks.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">No assessments yet.</td>
            </tr>
          ) : (
            tasks.map((task) => (
              <tr key={task.id}>
                <td className="px-3 py-2 font-medium">{task.name}</td>
                <td className="px-3 py-2 text-muted-foreground capitalize">{task.category.replace('_', ' ')}</td>
                <td className="px-3 py-2 text-muted-foreground">{task.subjectCode ?? task.learningAreaName ?? '-'}</td>
                <td className="px-3 py-2 text-muted-foreground text-right">{task.maxScore ?? '-'}</td>
                <td className="px-3 py-2 text-muted-foreground text-right">{task.weight ?? '-'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{task.gradedCount}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

type TaskResult = { ok: true } | { ok: false; error: string }