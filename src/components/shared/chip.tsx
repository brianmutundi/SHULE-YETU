import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const chipVariants = cva(
  'inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        status: 'bg-chip-status text-chip-status-foreground',
        gender: 'bg-chip-gender text-chip-gender-foreground',
        class: 'bg-chip-class text-chip-class-foreground',
        relation: 'bg-chip-relation text-chip-relation-foreground',
        neutral: 'bg-chip-neutral text-chip-neutral-foreground',
        warning: 'bg-chip-warning text-chip-warning-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export type ChipTone = NonNullable<VariantProps<typeof chipVariants>['tone']>

/** Pastel label chip. Always carries text, so meaning is never colour alone. */
export function Chip({
  tone,
  className,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof chipVariants>) {
  return <span data-slot="chip" className={cn(chipVariants({ tone }), className)} {...props} />
}
