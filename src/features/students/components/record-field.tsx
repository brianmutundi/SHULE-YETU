'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

/** Label, control and error for one field, used across every record tab. */
export function RecordField({
  label,
  name,
  defaultValue,
  error,
  required,
  type = 'text',
  placeholder,
  children,
}: {
  label: string
  name?: string
  defaultValue?: string | null
  error?: string
  required?: boolean
  type?: string
  placeholder?: string
  /** Renders a control instead of a text input, e.g. a select. */
  children?: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name} className="text-xs">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children ?? (
        <Input
          id={name}
          name={name}
          type={type}
          defaultValue={defaultValue ?? ''}
          placeholder={placeholder}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error && name ? `${name}-error` : undefined}
        />
      )}
      {error && (
        <p id={name ? `${name}-error` : undefined} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/** A labelled dropdown, styled to match Input. */
export function RecordSelect({
  name,
  defaultValue,
  options,
  error,
  required,
  blank,
}: {
  name: string
  defaultValue?: string | null
  options: readonly (readonly [string, string])[]
  error?: string
  required?: boolean
  blank?: string
}) {
  return (
    <select
      id={name}
      name={name}
      defaultValue={defaultValue ?? ''}
      required={required}
      aria-invalid={error ? true : undefined}
      className="h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {blank !== undefined && <option value="">{blank}</option>}
      {options.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  )
}

/** Read-only label/value pair for view mode. */
export function RecordValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value ?? <span className="text-muted-foreground">Not recorded</span>}</dd>
    </div>
  )
}

/** Shown where a later build phase has not landed yet. */
export function PendingNotice({ phase, children }: { phase: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border p-4">
      <p className="text-sm font-medium">Not available yet</p>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
      <p className="mt-2 text-xs text-muted-foreground">Arrives with {phase}.</p>
    </div>
  )
}