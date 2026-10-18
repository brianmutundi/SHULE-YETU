/**
 * Kenya's 47 counties.
 *
 * Reference data, not configuration: this is the statutory county list, so it
 * is the same for every school and does not belong in a tenant table. Used for
 * the dropdown so a registrar picks "Nairobi" rather than typing "Nairobi
 * Cnty", which would then not match the county recorded by another school.
 */
export const KENYA_COUNTIES = [
  'Baringo',
  'Bomet',
  'Bungoma',
  'Busia',
  'Elgeyo Marakwet',
  'Embu',
  'Garissa',
  'Homa Bay',
  'Isiolo',
  'Kajiado',
  'Kakamega',
  'Kericho',
  'Kiambu',
  'Kilifi',
  'Kirinyaga',
  'Kisii',
  'Kisumu',
  'Kitui',
  'Kwale',
  'Laikipia',
  'Lamu',
  'Machakos',
  'Makueni',
  'Mandera',
  'Marsabit',
  'Meru',
  'Migori',
  'Mombasa',
  'Murang\u2019a',
  'Nairobi',
  'Nakuru',
  'Nandi',
  'Narok',
  'Nyamira',
  'Nyandarua',
  'Nyeri',
  'Samburu',
  'Siaya',
  'Taita Taveta',
  'Tana River',
  'Tharaka Nithi',
  'Trans Nzoia',
  'Turkana',
  'Uasin Gishu',
  'Vihiga',
  'Wajir',
  'West Pokot',
] as const

/** Murang'a appears in official lists with both apostrophes. */
export const COUNTY_LOOKUP = new Map<string, string>([
  ['Muranga', 'Murang\u2019a'],
  ["Murang'a", 'Murang\u2019a'],
  ['Murang\u2019a', 'Murang\u2019a'],
])

/** Map free-typed input onto the statutory spelling where possible. */
export function normaliseCounty(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const canonical = COUNTY_LOOKUP.get(trimmed)
  if (canonical) return canonical

  const lower = trimmed.toLowerCase()
  const match = KENYA_COUNTIES.find((c) => c.toLowerCase() === lower)

  return match ?? trimmed
}