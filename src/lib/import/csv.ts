/**
 * RFC 4180 CSV reader.
 *
 * Pure text handling with no server-only dependencies, so it is directly
 * testable and reusable by anything that needs to read a CSV.
 *
 * Handles quoted fields, escaped quotes and newlines inside quotes. A naive
 * split(',') gets all three wrong, and a guardian address or a surname
 * containing a comma is ordinary rather than exotic.
 */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        // "" inside a quoted field is a literal quote.
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += char
      i += 1
      continue
    }

    if (char === '"') {
      inQuotes = true
      i += 1
      continue
    }

    if (char === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }

    if (char === '\r') {
      i += 1
      continue
    }

    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
      continue
    }

    field += char
    i += 1
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // A trailing newline leaves one empty row behind; it is not data.
  return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0))
}