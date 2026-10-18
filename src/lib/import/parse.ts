import 'server-only'
import ExcelJS from 'exceljs'
import { buildHeaderMap, getImportColumns, MAX_IMPORT_ROWS, type ImportColumn } from './columns'
import { parseCsvText } from './csv'
import type { OperatingMode } from '@/lib/school-type'

/**
 * Uploaded-file reader.
 *
 * Turns an .xlsx or .csv upload into normalized row objects keyed by the column
 * contract in columns.ts. Parsing is deliberately tolerant about shape and
 * strict about meaning: an unrecognised header is reported rather than
 * silently dropped, and the meaning of a value is decided in validate.ts.
 *
 * The file is untrusted input carrying children's personal data. Nothing here
 * interprets a cell as more than a value.
 */

export interface RawRow {
  /** 1-based line number in the file, so an error message points at a real row. */
  rowNumber: number
  values: Record<string, string>
}

export interface ParseResult {
  rows: RawRow[]
  /** Headers present in the file that the template does not define. */
  unknownColumns: string[]
  /** Required template columns the file is missing entirely. */
  missingColumns: string[]
  /** Set when the file could not be read at all. */
  fatal?: string
}

/** A physical spreadsheet column bound to a template field. */
type MappedColumn = { index: number; column: ImportColumn }

/**
 * Read an uploaded file.
 *
 * The extension picks the reader rather than sniffing content: exceljs and the
 * CSV path fail differently on the wrong input, and a specific message per path
 * is more useful to a registrar than a unified guess.
 */
export async function parseUpload(
  // exceljs bundles its own @types/node, so its Buffer and the app's Buffer are
  // structurally different types that mean the same thing. Uint8Array is what
  // exceljs actually accepts and both sides agree on it.
  bytes: Uint8Array,
  fileName: string,
  mode: OperatingMode,
): Promise<ParseResult> {
  const lower = fileName.toLowerCase()

  if (lower.endsWith('.csv')) return parseCsv(bytes, mode)
  if (lower.endsWith('.xlsx')) return parseXlsx(bytes, mode)

  return { rows: [], unknownColumns: [], missingColumns: [], fatal: 'Upload a .xlsx or .csv file.' }
}

/* ------------------------------------------------------------------ *
 * xlsx
 * ------------------------------------------------------------------ */

async function parseXlsx(bytes: Uint8Array, mode: OperatingMode): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook()

  try {
    // exceljs types load() against its own bundled @types/node, whose Buffer
    // predates the resizable-buffer properties the app's version declares. The
    // values are identical; only the declarations differ. Deriving the type
    // from the signature avoids naming either one of them.
    type LoadArg = Parameters<typeof workbook.xlsx.load>[0]
    await workbook.xlsx.load(bytes as unknown as LoadArg)
  } catch {
    return {
      rows: [],
      unknownColumns: [],
      missingColumns: [],
      fatal:
        'That file could not be read as an Excel workbook. Re-download the template and fill it in without changing the format.',
    }
  }

  const sheet = workbook.getWorksheet('Students') ?? workbook.worksheets[0]

  if (!sheet) {
    return { rows: [], unknownColumns: [], missingColumns: [], fatal: 'That workbook has no sheets. Use the template as downloaded.' }
  }

  const headerRow = sheet.getRow(1)
  const { columns, unknownColumns, present } = mapColumns(headerRow, mode)
  const missingColumns = requiredMissing(columns, present, mode)

  const rows: RawRow[] = []

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    // Row 1 is the header. Row 2 is the worked example the template ships
    // with, which must never be imported as a real learner.
    if (rowNumber <= 2) return
    if (rows.length >= MAX_IMPORT_ROWS) return

    const values = readRow(row, columns)
    if (isBlank(values)) return

    rows.push({ rowNumber, values })
  })

  return { rows, unknownColumns, missingColumns }
}

/* ------------------------------------------------------------------ *
 * CSV
 * ------------------------------------------------------------------ */

function parseCsv(bytes: Uint8Array, mode: OperatingMode): ParseResult {
  // Strip a UTF-8 BOM. Excel writes one, and without stripping it the first
  // header reads "Admission No﻿", matches nothing, and the column silently
  // disappears. This codebase has been bitten by BOM round-trips before.
  let text = Buffer.from(bytes).toString('utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  const table = parseCsvText(text)

  if (table.length === 0) {
    return { rows: [], unknownColumns: [], missingColumns: [], fatal: 'That file is empty.' }
  }

  const { columns, unknownColumns, present } = mapHeaderCells(
    table[0].map((cell) => cell.trim()),
    mode,
  )
  const missingColumns = requiredMissing(columns, present, mode)

  const rows: RawRow[] = []

  for (let i = 1; i < table.length && rows.length < MAX_IMPORT_ROWS; i += 1) {
    const values: Record<string, string> = {}

    for (const { index, column } of columns) {
      values[column.key] = (table[i][index] ?? '').trim()
    }

    if (isBlank(values)) continue
    rows.push({ rowNumber: i + 1, values })
  }

  return { rows, unknownColumns, missingColumns }
}

/* ------------------------------------------------------------------ *
 * Header mapping
 * ------------------------------------------------------------------ */

/**
 * Bind physical columns to template fields.
 *
 * Headers are matched on normalized text, and the `*` the template appends to
 * required columns is optional in the match: registrars retype headers, and
 * losing the star should not lose the column.
 */
function mapColumns(headerRow: ExcelJS.Row, mode: OperatingMode) {
  const headerCells: string[] = []
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headerCells[colNumber - 1] = cellText(cell)
  })

  return mapHeaderCells(headerCells, mode)
}

function mapHeaderCells(headerCells: string[], mode: OperatingMode) {
  const known = buildHeaderMap(mode)
  const columns: MappedColumn[] = []
  const present = new Set<string>()
  const unknownColumns: string[] = []

  headerCells.forEach((header, index) => {
    if (header === undefined || header === '') return

    const column =
      known.get(normalizeHeader(header)) ??
      known.get(normalizeHeader(header.replace(/\s*\*$/, '')))

    if (column) {
      columns.push({ index, column })
      present.add(column.key)
    } else {
      unknownColumns.push(header)
    }
  })

  return { columns, unknownColumns, present }
}

/** Required columns for this mode that the file does not provide. */
function requiredMissing(columns: MappedColumn[], present: Set<string>, mode: OperatingMode) {
  return getImportColumns(mode)
    .filter((column) => column.required && !present.has(column.key))
    .map((column) => column.header)
}

function readRow(row: ExcelJS.Row, columns: MappedColumn[]) {
  const values: Record<string, string> = {}

  for (const { index, column } of columns) {
    values[column.key] = cellText(row.getCell(index + 1))
  }

  return values
}

/* ------------------------------------------------------------------ *
 * Cell coercion
 * ------------------------------------------------------------------ */

/**
 * Read a cell as text.
 *
 * A date cell becomes `YYYY-MM-DD` rather than the locale's long date: the
 * value has to satisfy an ISO date check downstream, and there is no locale
 * that renders it unambiguously.
 */
function cellText(cell: ExcelJS.Cell): string {
  const value = cell?.value

  if (value === null || value === undefined) return ''

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
  }

  if (typeof value === 'object') {
    // ExcelJS wraps rich text, formulas and errors in an object.
    const cell2 = value as {
      richText?: { text: string }[]
      text?: string
      result?: unknown
      error?: unknown
    }

    if (Array.isArray(cell2.richText)) {
      return cell2.richText.map((part) => part.text).join('').trim()
    }
    if (typeof cell2.text === 'string') return cell2.text.trim()
    if (cell2.result !== undefined) return cellText({ value: cell2.result } as ExcelJS.Cell)
    // An error cell has no usable value; leave it blank so validation reports
    // a missing required field rather than passing "#REF!" downstream.
    if (cell2.error) return ''
    return ''
  }

  return String(value).trim()
}

function isBlank(values: Record<string, string>): boolean {
  return Object.values(values).every((value) => value.length === 0)
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
}