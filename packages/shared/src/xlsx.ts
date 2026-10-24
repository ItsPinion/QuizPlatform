/**
 * Reading an `.xlsx` workbook, in the browser, without a spreadsheet library.
 *
 * An `.xlsx` is a ZIP of XML: `xl/workbook.xml` names the sheets,
 * `xl/_rels/workbook.xml.rels` points at their files, `xl/sharedStrings.xml`
 * holds the strings cells reference by index, and `xl/worksheets/sheet1.xml` is
 * the grid. That is the whole format for the part a question import needs, and
 * it is a few dozen lines of string handling once `fflate` has unzipped it.
 *
 * A full spreadsheet engine is not what this is. It reads the **first sheet**,
 * the **cell values**, and nothing else: no styles, no formulas (a formula's
 * cached value is read, which is what a spreadsheet shows), no merged cells, no
 * dates as dates (a question's marks and `correct` column are numbers, and a
 * date is not a column this import has).
 *
 * Why in the browser — `fflate` is 8 kB, unzipping an upload client-side keeps
 * the API's 64 kB body budget for *questions* rather than for a zip, and the
 * console can then preview the parse before anything is sent. The rows are
 * converted back to CSV text (`toCsv`) and posted to the same endpoint a `.csv`
 * uses, so there is exactly one server-side contract and one parser for the
 * rules.
 */
import { strFromU8, unzipSync } from 'fflate';

/** The ZIP magic. `.xls` (the old binary format) is not this, and is refused. */
export function isWorkbook(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  );
}

/** Cap the grid so a pathological file cannot become a memory problem. */
const MAX_ROWS = 5_000;
const MAX_COLUMNS = 64;

/** `AB12` → 27. Column letters, base 26, zero-based. */
export function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref.toUpperCase())?.[1] ?? '';
  let value = 0;

  for (const character of letters) value = value * 26 + (character.charCodeAt(0) - 64);

  // No letters at all: treat it as the first column rather than -1, which would
  // make `cells[-1]` a silent no-op and drop the cell.
  return Math.max(0, value - 1);
}

/** The handful of XML entities Excel writes. */
function decodeEntities(value: string): string {
  return (
    value
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&amp;/g, '&')
      // Excel escapes a carriage return inside a cell this way.
      .replace(/_x000D_/g, '\r')
      .replace(/_x000A_/g, '\n')
  );
}

/** The text inside `<t>` elements, joined — a rich-text cell has several. */
function textOf(xml: string): string {
  const parts = [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => match[1] ?? '');
  return decodeEntities(parts.join(''));
}

/** Shared strings, in index order. */
function readSharedStrings(files: Record<string, Uint8Array>): string[] {
  const raw = files['xl/sharedStrings.xml'];
  if (!raw) return [];

  const xml = strFromU8(raw);
  const entries = [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)];

  return entries.map((match) => textOf(match[1] ?? ''));
}

/**
 * The path of the first sheet.
 *
 * `workbook.xml` maps `r:id` → a relationship, and the relationship maps to a
 * target inside `xl/`. Falling back to `xl/worksheets/sheet1.xml` covers the
 * workbooks that omit the rels part, which some exporters do.
 */
function firstSheetPath(files: Record<string, Uint8Array>): string {
  const workbook = files['xl/workbook.xml'];
  const rels = files['xl/_rels/workbook.xml.rels'];

  if (workbook && rels) {
    const xml = strFromU8(workbook);
    const first =
      /<sheet\b[^>]*\br:id="([^"]+)"/.exec(xml)?.[1] ??
      /<sheet\b[^>]*\bsheetId="([^"]+)"/.exec(xml)?.[1];

    if (first) {
      const relXml = strFromU8(rels);
      const match = new RegExp(
        `<Relationship\\b[^>]*\\bId="${first}"[^>]*\\bTarget="([^"]+)"`,
      ).exec(relXml);
      const target = match?.[1];

      if (target) {
        const normalised = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
        if (files[normalised]) return normalised;
      }
    }
  }

  return 'xl/worksheets/sheet1.xml';
}

/** One `<c>` element → its value as a string. */
function cellValue(attributes: string, body: string, shared: readonly string[]): string {
  const type = /\bt="([^"]+)"/.exec(attributes)?.[1] ?? 'n';
  const raw = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1];

  if (type === 's') {
    const index = Number(raw ?? '');
    return Number.isInteger(index) ? (shared[index] ?? '') : '';
  }

  if (type === 'inlineStr') {
    return textOf(body);
  }

  if (type === 'str') {
    return decodeEntities(raw ?? '');
  }

  if (type === 'b') {
    return raw === '1' ? 'TRUE' : 'FALSE';
  }

  return decodeEntities(raw ?? '');
}

/**
 * The first sheet as rows of strings.
 *
 * Empty rows are dropped (Excel stores a row per *styled* line, and a formatted
 * empty row is not a question), and columns are placed by their reference rather
 * than by order, because a spreadsheet is allowed to skip a cell.
 */
export function readWorkbook(bytes: Uint8Array): string[][] {
  const files = unzipSync(bytes);
  const shared = readSharedStrings(files);

  const raw = files[firstSheetPath(files)];
  if (!raw) throw new Error('That workbook has no worksheet in it.');

  const xml = strFromU8(raw);
  const rows: string[][] = [];

  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const attributes = rowMatch[1] ?? '';
    const body = rowMatch[2] ?? '';
    const cells: string[] = [];

    for (const cellMatch of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const cellAttributes = cellMatch[1] ?? '';
      const ref = /\br="([A-Z]+\d+)"/.exec(cellAttributes)?.[1];
      const index = ref ? columnIndex(ref) : cells.length;

      if (index >= MAX_COLUMNS) continue;

      while (cells.length < index) cells.push('');
      cells[index] = cellValue(cellAttributes, cellMatch[2] ?? '', shared);
    }

    if (cells.some((cell) => cell.trim() !== '')) rows.push(cells);

    if (rows.length >= MAX_ROWS) break;
  }

  return rows;
}

/**
 * A workbook → CSV text, ready for `parseQuestionImport`.
 *
 * Throws a message a person can act on, because this runs on a file the visitor
 * chose and "invalid zip" is not an instruction.
 */
export function workbookToCsv(bytes: Uint8Array): string {
  let rows: string[][];

  try {
    rows = readWorkbook(bytes);
  } catch (error) {
    throw new Error(
      `That workbook could not be read (${error instanceof Error ? error.message : 'unknown error'}). Export the sheet as CSV instead.`,
    );
  }

  if (rows.length === 0) throw new Error('That workbook has no rows in its first sheet.');

  return rows
    .map((row) =>
      row.map((cell) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(','),
    )
    .join('\n');
}
