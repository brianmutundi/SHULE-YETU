/**
 * Null-safe full name. other_names and surname are both nullable, so a bare
 * template string would print "null". Blank and whitespace-only parts are
 * dropped too.
 */
export function fullNameOf(
  firstName: string | null | undefined,
  otherNames: string | null | undefined,
  surname: string | null | undefined,
): string {
  return [firstName, otherNames, surname]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
}
