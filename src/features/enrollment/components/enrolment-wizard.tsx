'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { submitEnrolment } from '../actions'
import type { YearOption } from '@/lib/auth/period'

export interface StreamOption {
  id: string
  label: string
  classLabel: string
}

export interface PathwayOption {
  code: string
  name: string
}

const STEPS = [
  'Basic info',
  'Admission',
  'Guardians',
  'Health and academic',
  'Logistics and finance',
  'Documents and consent',
] as const

type GuardianDraft = {
  fullName: string
  nationalId: string
  phone: string
  email: string
  occupation: string
  relationship: string
  isPrimary: boolean
  isEmergencyContact: boolean
  isFeePayer: boolean
  isDeceased: boolean
}

const emptyGuardian = (): GuardianDraft => ({
  fullName: '',
  nationalId: '',
  phone: '',
  email: '',
  occupation: '',
  relationship: 'parent',
  isPrimary: false,
  isEmergencyContact: false,
  isFeePayer: false,
  isDeceased: false,
})

/**
 * Six-step enrolment wizard (CLAUDE.md section 7.5).
 *
 * Step 2 is mode-aware: basic schools get admission fields, senior schools
 * get placement fields. The mode comes from the server, never from the client.
 */
export function EnrolmentWizard({
  operatingMode,
  years,
  streams,
  pathways,
  defaultYearId,
}: {
  operatingMode: 'basic' | 'senior'
  years: YearOption[]
  streams: StreamOption[]
  pathways: PathwayOption[]
  defaultYearId: string
}) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [student, setStudent] = useState({
    firstName: '', otherNames: '', surname: '', gender: 'female', dateOfBirth: '',
    nationality: '', county: '', subCounty: '', upi: '', birthCertNo: '',
    address: '', phone: '', email: '', tuitionWaiver: false, orphanStatus: 'none',
  })
  const [admission, setAdmission] = useState({
    admittedOn: new Date().toISOString().slice(0, 10),
    academicYearId: defaultYearId,
    streamId: '',
    previousSchool: '',
    transferReason: '',
  })
  const [placement, setPlacement] = useState({
    pathwayCode: '', track: '', assessmentNumber: '', subjectIds: [] as string[],
  })
  const [guardians, setGuardians] = useState<GuardianDraft[]>([
    { ...emptyGuardian(), isFeePayer: true },
  ])
  const [health, setHealth] = useState({
    bloodGroup: '', allergies: '', conditions: '', emergencyContact: '',
    strengths: '', challenges: '', specialNeedsCategory: '', specialNeedsNotes: '',
  })
  const [logistics, setLogistics] = useState({
    transportMode: '', transportRoute: '', boardingStatus: 'day' as 'day' | 'boarding', house: '',
  })
  const [consents, setConsents] = useState({ enrolment: false, dataPrivacy: false, media: false })

  const set = <K extends keyof typeof student>(k: K, v: (typeof student)[K]) =>
    setStudent((s) => ({ ...s, [k]: v }))

  /** Per-step gate. Only the fields needed to advance are checked. */
  const stepError = useMemo((): string | null => {
    switch (step) {
      case 0:
        if (!student.firstName.trim()) return 'First name is required.'
        if (!student.dateOfBirth) return 'Date of birth is required.'
        if (!student.county.trim()) return 'County is required.'
        if (!student.subCounty.trim()) return 'Sub-county is required.'
        return null
      case 1:
        if (!admission.admittedOn) return 'Admission date is required.'
        if (operatingMode === 'senior' && !placement.pathwayCode) return 'Select a pathway.'
        return null
      case 2:
        if (guardians.length === 0) return 'Add at least one guardian.'
        if (guardians.some((g) => !g.fullName.trim())) return 'Every guardian needs a name.'
        if (guardians.some((g) => !g.phone.trim())) return 'Every guardian needs a phone number.'
        if (!guardians.some((g) => g.isFeePayer)) return 'Mark one guardian as the fee payer.'
        return null
      case 5:
        if (!consents.enrolment) return 'Enrolment consent is required.'
        return null
      default:
        return null
    }
  }, [step, student, admission, placement, guardians, consents, operatingMode])

  const submit = () => {
    setError(null)
    const streamId = admission.streamId

    const payload = {
      operatingMode,
      student,
      guardians,
      health,
      logistics,
      consents: { ...consents, enrolmentBasis: 'consent' },
      ...(operatingMode === 'basic'
        ? { admission }
        : {
            placement: {
              ...admission,
              pathwayCode: placement.pathwayCode,
              track: placement.track,
              assessmentNumber: placement.assessmentNumber,
              subjectIds: placement.subjectIds,
            },
          }),
    }

    startTransition(async () => {
      const result = await submitEnrolment({ ...payload, ...(streamId ? {} : {}) })
      if (result.ok) {
        router.push(`/students?id=${result.studentId}`)
      } else {
        setError(result.error)
      }
    })
  }

  const updateGuardian = (index: number, patch: Partial<GuardianDraft>) =>
    setGuardians((gs) => gs.map((g, i) => (i === index ? { ...g, ...patch } : g)))

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap items-center gap-2" aria-label="Enrolment steps">
        {STEPS.map((label, index) => {
          const done = index < step
          const current = index === step
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => index <= step && setStep(index)}
                disabled={index > step}
                aria-current={current ? 'step' : undefined}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                  current
                    ? 'border-primary bg-primary text-primary-foreground'
                    : done
                      ? 'border-primary/40 text-foreground'
                      : 'border-border text-muted-foreground'
                }`}
              >
                <span className="font-mono">{index + 1}</span>
                {label}
              </button>
            </li>
          )
        })}
      </ol>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border border-border p-4">
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" required>
              <Input value={student.firstName} onChange={(e) => set('firstName', e.target.value)} />
            </Field>
            <Field label="Other names">
              <Input value={student.otherNames} onChange={(e) => set('otherNames', e.target.value)} />
            </Field>
            <Field label="Surname">
              <Input value={student.surname} onChange={(e) => set('surname', e.target.value)} />
            </Field>
            <Field label="Gender" required>
              <Select
                value={student.gender}
                onChange={(v) => set('gender', v as 'male' | 'female')}
                options={[
                  ['female', 'Female'],
                  ['male', 'Male'],
                ]}
              />
            </Field>
            <Field label="Date of birth" required>
              <Input
                type="date"
                value={student.dateOfBirth}
                onChange={(e) => set('dateOfBirth', e.target.value)}
              />
            </Field>
            <Field label="Nationality">
              <Input value={student.nationality} onChange={(e) => set('nationality', e.target.value)} />
            </Field>
            <Field label="County" required>
              <Input value={student.county} onChange={(e) => set('county', e.target.value)} />
            </Field>
            <Field label="Sub-county" required>
              <Input value={student.subCounty} onChange={(e) => set('subCounty', e.target.value)} />
            </Field>
            <Field label="UPI">
              <Input value={student.upi} onChange={(e) => set('upi', e.target.value)} />
            </Field>
            <Field label="Birth certificate no.">
              <Input value={student.birthCertNo} onChange={(e) => set('birthCertNo', e.target.value)} />
            </Field>
            <Field label="Address">
              <Input value={student.address} onChange={(e) => set('address', e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input value={student.phone} onChange={(e) => set('phone', e.target.value)} placeholder="07XX XXX XXX" />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Admission date" required>
              <Input
                type="date"
                value={admission.admittedOn}
                onChange={(e) => setAdmission((a) => ({ ...a, admittedOn: e.target.value }))}
              />
            </Field>
            <Field label="Academic year" required>
              <Select
                value={admission.academicYearId}
                onChange={(v) => setAdmission((a) => ({ ...a, academicYearId: v }))}
                options={years.map((y) => [y.id, String(y.calendarYear)])}
              />
            </Field>
            <Field label="Class and stream">
              <Select
                value={admission.streamId}
                onChange={(v) => setAdmission((a) => ({ ...a, streamId: v }))}
                options={[...streams.map((s) => [s.id, `${s.classLabel} ${s.label}`] as [string, string]), ['', 'Unassigned'] as [string, string]]}
              />
            </Field>

            {operatingMode === 'senior' ? (
              <>
                <Field label="Pathway" required hint={pathways.length === 0 ? 'No pathways configured for this school yet.' : undefined}>
                  <Select
                    value={placement.pathwayCode}
                    onChange={(v) => setPlacement((p) => ({ ...p, pathwayCode: v }))}
                    options={pathways.map((p) => [p.code, p.name])}
                  />
                </Field>
                <Field label="Track">
                  <Input value={placement.track} onChange={(e) => setPlacement((p) => ({ ...p, track: e.target.value }))} />
                </Field>
                <Field label="KNEC assessment number">
                  <Input
                    value={placement.assessmentNumber}
                    onChange={(e) => setPlacement((p) => ({ ...p, assessmentNumber: e.target.value }))}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="Previous school">
                  <Input
                    value={admission.previousSchool}
                    onChange={(e) => setAdmission((a) => ({ ...a, previousSchool: e.target.value }))}
                  />
                </Field>
                <Field label="Transfer reason">
                  <Input
                    value={admission.transferReason}
                    onChange={(e) => setAdmission((a) => ({ ...a, transferReason: e.target.value }))}
                  />
                </Field>
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {guardians.map((g, i) => (
              <fieldset key={i} className="space-y-3 rounded-md border border-border p-3">
                <legend className="px-1 text-xs font-medium">Guardian {i + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Full name" required>
                    <Input value={g.fullName} onChange={(e) => updateGuardian(i, { fullName: e.target.value })} />
                  </Field>
                  <Field label="Phone" required>
                    <Input value={g.phone} onChange={(e) => updateGuardian(i, { phone: e.target.value })} placeholder="07XX XXX XXX" />
                  </Field>
                  <Field label="National ID">
                    <Input value={g.nationalId} onChange={(e) => updateGuardian(i, { nationalId: e.target.value })} />
                  </Field>
                  <Field label="Occupation">
                    <Input value={g.occupation} onChange={(e) => updateGuardian(i, { occupation: e.target.value })} />
                  </Field>
                  <Field label="Relationship">
                    <Select
                      value={g.relationship}
                      onChange={(v) => updateGuardian(i, { relationship: v })}
                      options={[
                        ['parent', 'Parent'], ['grandparent', 'Grandparent'], ['sibling', 'Sibling'],
                        ['aunt_uncle', 'Aunt or uncle'], ['relative', 'Relative'],
                        ['guardian', 'Guardian'], ['other', 'Other'],
                      ]}
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  {(
                    [
                      ['isPrimary', 'Primary'],
                      ['isEmergencyContact', 'Emergency contact'],
                      ['isFeePayer', 'Fee payer'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="size-3.5"
                        checked={g[key]}
                        onChange={(e) => updateGuardian(i, { [key]: e.target.checked })}
                      />
                      {label}
                    </label>
                  ))}
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="size-3.5"
                      checked={g.isDeceased}
                      onChange={(e) => updateGuardian(i, { isDeceased: e.target.checked })}
                    />
                    Deceased or absent
                  </label>
                </div>
                {guardians.length > 1 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setGuardians((gs) => gs.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                )}
              </fieldset>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setGuardians((gs) => [...gs, emptyGuardian()])}>
              Add another
            </Button>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Blood group">
              <Input value={health.bloodGroup} onChange={(e) => setHealth((h) => ({ ...h, bloodGroup: e.target.value }))} />
            </Field>
            <Field label="Emergency contact">
              <Input value={health.emergencyContact} onChange={(e) => setHealth((h) => ({ ...h, emergencyContact: e.target.value }))} />
            </Field>
            <Field label="Allergies">
              <Input value={health.allergies} onChange={(e) => setHealth((h) => ({ ...h, allergies: e.target.value }))} />
            </Field>
            <Field label="Conditions">
              <Input value={health.conditions} onChange={(e) => setHealth((h) => ({ ...h, conditions: e.target.value }))} />
            </Field>
            <Field label="Strengths">
              <Input value={health.strengths} onChange={(e) => setHealth((h) => ({ ...h, strengths: e.target.value }))} />
            </Field>
            <Field label="Challenges">
              <Input value={health.challenges} onChange={(e) => setHealth((h) => ({ ...h, challenges: e.target.value }))} />
            </Field>
            <Field label="Special needs category">
              <Input value={health.specialNeedsCategory} onChange={(e) => setHealth((h) => ({ ...h, specialNeedsCategory: e.target.value }))} />
            </Field>
            <Field label="Special needs notes">
              <Input value={health.specialNeedsNotes} onChange={(e) => setHealth((h) => ({ ...h, specialNeedsNotes: e.target.value }))} />
            </Field>
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Transport mode">
              <Input value={logistics.transportMode} onChange={(e) => setLogistics((l) => ({ ...l, transportMode: e.target.value }))} />
            </Field>
            <Field label="Route">
              <Input value={logistics.transportRoute} onChange={(e) => setLogistics((l) => ({ ...l, transportRoute: e.target.value }))} />
            </Field>
            <Field label="Boarding">
              <Select
                value={logistics.boardingStatus}
                onChange={(v) => setLogistics((l) => ({ ...l, boardingStatus: v as 'day' | 'boarding' }))}
                options={[['day', 'Day'], ['boarding', 'Boarding']]}
              />
            </Field>
            <Field label="House">
              <Input value={logistics.house} onChange={(e) => setLogistics((l) => ({ ...l, house: e.target.value }))} />
            </Field>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={student.tuitionWaiver}
                  onChange={(e) => set('tuitionWaiver', e.target.checked)}
                />
                Tuition waiver
              </label>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div className="space-y-3 rounded-md border border-border p-3">
              {(
                [
                  ['enrolment', 'Parent or guardian enrolment consent', true],
                  ['dataPrivacy', 'Data privacy and protection agreement', false],
                  ['media', 'Media and photography consent', false],
                ] as const
              ).map(([key, label, required]) => (
                <label key={key} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4"
                    checked={consents[key]}
                    onChange={(e) => setConsents((c) => ({ ...c, [key]: e.target.checked }))}
                  />
                  <span>
                    {label}
                    {required && <span className="text-destructive"> *</span>}
                    <span className="block text-xs text-muted-foreground">
                      {key === 'enrolment'
                        ? 'Required. Records the legal basis for enrolling this learner.'
                        : key === 'dataPrivacy'
                          ? 'How this learner\'s personal data may be processed and retained.'
                          : 'Whether the learner may appear in photographs.'}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Document upload arrives with the student record phase. Consents are recorded now
              with their lawful basis.
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          Previous
        </Button>

        <p className="text-xs text-muted-foreground" role="status">
          {stepError ?? `Step ${step + 1} of ${STEPS.length}`}
        </p>

        {step < STEPS.length - 1 ? (
          <Button
            onClick={() => setStep((s) => s + 1)}
            disabled={stepError !== null}
          >
            Continue
          </Button>
        ) : (
          <Button onClick={submit} disabled={pending || stepError !== null}>
            {pending ? 'Enrolling...' : 'Complete enrolment'}
          </Button>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  children,
  required,
  hint,
}: {
  label: string
  children: React.ReactNode
  required?: boolean
  hint?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: [string, string][]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  )
}