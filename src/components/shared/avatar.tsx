import { cn } from '@/lib/utils'

/** First letters of the first and last word. Safe on empty and null-ish input. */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0][0] ?? ''
  const last = words.length > 1 ? (words[words.length - 1][0] ?? '') : ''
  return (first + last).toUpperCase()
}

const SIZES = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-16 text-xl',
} as const

/**
 * Learner or staff photo, falling back to initials.
 *
 * Only absolute http(s) URLs are rendered as images. A bare storage path is
 * not fetchable from the browser, so it shows initials rather than a broken
 * image.
 */
export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string
  src?: string | null
  size?: keyof typeof SIZES
  className?: string
}) {
  const showImage = typeof src === 'string' && /^https?:\/\//i.test(src)

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft font-medium text-foreground',
        SIZES[size],
        className,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote storage host is not in next.config images
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        initialsOf(name)
      )}
    </span>
  )
}
