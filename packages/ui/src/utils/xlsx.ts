import { unzip } from "./zip.js";

/**
 * Minimal XLSX reader — just enough of the SpreadsheetML surface to turn a
 * Salesforce Excel export into the same CSV text the existing importers
 * already consume, so an .xlsx upload flows through the identical
 * parse -> validate -> import path as a .csv one (see UploadFAB).
 *
 * No npm dependency: an .xlsx is a ZIP of XML, and both halves are small,
 * self-contained algorithms — consistent with this project's
 * dependency-conservatism (see parseCsv's and GeocoderAdapter's precedent).
 * The ZIP half lives in ./zip.ts because .docx needs the identical
 * container handling; only the SpreadsheetML parsing is here.
 *
 * The awkward part is not the format, it is Salesforce: an Excel export is
 * the *formatted report*, not a flat table. It carries a title block, a
 * "Filtered By" preamble, spacer columns either side, sort arrows glued to
 * the header labels, and Subtotal/Count rows interleaved with the data.
 * Most of what follows deals with that rather than with exotic Excel features.
 */

/** Salesforce glues a sort direction onto the header label, e.g. "Account Owner  ↑". */
const SORT_GLYPHS = /[↑↓▲▴▼▾]/g;

/**
 * Whole-cell labels Salesforce emits for its grouping rows. Matched
 * exactly (case-insensitively) against every cell of a row — including
 * columns outside the header — because a "Count" row parks its number
 * under an arbitrary column and would otherwise import as a real record.
 */
const AGGREGATE_ROW_LABELS = new Set([
  "subtotal",
  "subtotals",
  "total",
  "totals",
  "grand total",
  "grand totals",
  "count",
  "record count",
  "total records",
  "sum",
  "average",
  "avg",
]);

/** Builtin numFmtIds meaning "this number is a date". Time-only formats (18-21, 45-47) deliberately excluded. */
const BUILTIN_DATE_FORMAT_IDS = new Set([
  14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56, 57, 58,
]);
const BUILTIN_PERCENT_FORMAT_IDS = new Set([9, 10]);

type CellFormatKind = "date" | "percent" | "other";

export interface XlsxSheet {
  name: string;
  /** Row-major. Excel's 1-indexed sparse rows/columns are flattened and hole-filled with "". */
  cells: string[][];
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

/** Attribute values are quoted, so tag bodies are scanned quote-aware — a format code can contain ">". */
const TAG_BODY = '(?:[^>"]|"[^"]*")*';

function tagPattern(name: string): RegExp {
  return new RegExp(`<${name}\\b(${TAG_BODY})(?:/>|>([\\s\\S]*?)</${name}>)`, "g");
}

function attr(tagBody: string, name: string): string | undefined {
  return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tagBody)?.[1];
}

function decodeXmlEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_match, entity: string) => {
    switch (entity) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default:
        return entity[1] === "x"
          ? String.fromCodePoint(Number.parseInt(entity.slice(2), 16))
          : String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
  });
}

/** Concatenates every <t> run in a fragment — one string can be split across rich-text runs. */
function textRuns(fragment: string): string {
  const withoutPhonetic = fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let text = "";
  for (const match of withoutPhonetic.matchAll(tagPattern("t"))) {
    text += decodeXmlEntities(match[2] ?? "");
  }
  return text;
}

// ---------------------------------------------------------------------------
// Number formats
// ---------------------------------------------------------------------------

/** Strips the decorative parts of a format code, leaving only its type tokens. */
function cleanFormatCode(code: string): string {
  return (
    code
      .replace(/\[[^\]]*\]/g, "") // colours, locale ids, conditions
      .replace(/"[^"]*"/g, "") // literal text, e.g. "R$"
      .replace(/\\./g, "") // escaped single characters
      .split(";")[0] ?? ""
  );
}

function classifyFormatCode(code: string): CellFormatKind {
  const cleaned = cleanFormatCode(code);
  if (cleaned.includes("%")) return "percent";
  return /[yd]/i.test(cleaned) ? "date" : "other";
}

interface Styles {
  formatKindOfStyle: (styleIndex: number) => CellFormatKind;
}

function parseStyles(xml: string | undefined): Styles {
  const customCodes = new Map<number, string>();
  const formatIdOfStyle: number[] = [];

  if (xml) {
    for (const match of xml.matchAll(tagPattern("numFmt"))) {
      const id = Number(attr(match[1] ?? "", "numFmtId"));
      const code = attr(match[1] ?? "", "formatCode");
      if (Number.isFinite(id) && code !== undefined) customCodes.set(id, decodeXmlEntities(code));
    }
    const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
    for (const match of cellXfs.matchAll(tagPattern("xf"))) {
      formatIdOfStyle.push(Number(attr(match[1] ?? "", "numFmtId") ?? "0") || 0);
    }
  }

  return {
    formatKindOfStyle(styleIndex: number): CellFormatKind {
      const formatId = formatIdOfStyle[styleIndex] ?? 0;
      const custom = customCodes.get(formatId);
      if (custom !== undefined) return classifyFormatCode(custom);
      if (BUILTIN_DATE_FORMAT_IDS.has(formatId)) return "date";
      if (BUILTIN_PERCENT_FORMAT_IDS.has(formatId)) return "percent";
      return "other";
    },
  };
}

/**
 * Excel serial -> DD/MM/YYYY, the format the Salesforce CSV export uses and
 * the one the pipeline validator parses. Anchored at 1899-12-30 to absorb
 * Excel's fictitious 1900-02-29; serials below 61 (dates before March 1900)
 * come out a day early, which no real deal date reaches.
 */
function formatExcelDate(serial: number, date1904: boolean): string {
  const days = Math.floor(serial) + (date1904 ? 1462 : 0);
  const date = new Date(Date.UTC(1899, 11, 30) + days * 86_400_000);
  if (Number.isNaN(date.getTime())) return String(serial);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

/** Rounds off binary-float dust, so 0.2 under a percent format reads "20", not "20.000000000000004". */
function formatNumber(value: number): string {
  return String(Number(value.toFixed(10)));
}

// ---------------------------------------------------------------------------
// Worksheet
// ---------------------------------------------------------------------------

function columnIndexFromRef(ref: string): number {
  let index = 0;
  for (const char of ref) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) break;
    index = index * 26 + (code - 64);
  }
  return index - 1;
}

interface SheetContext {
  sharedStrings: string[];
  styles: Styles;
  date1904: boolean;
}

function readCell(tagBody: string, inner: string, context: SheetContext): string {
  const type = attr(tagBody, "t") ?? "n";
  if (type === "inlineStr") return textRuns(inner);

  const rawValue = tagPattern("v").exec(inner)?.[2];
  if (rawValue === undefined) return "";
  const value = decodeXmlEntities(rawValue);

  if (type === "s") return context.sharedStrings[Number(value)] ?? "";
  if (type === "str" || type === "e") return value;
  if (type === "b") return value === "1" ? "TRUE" : "FALSE";

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;

  const kind = context.styles.formatKindOfStyle(Number(attr(tagBody, "s") ?? "0") || 0);
  if (kind === "date") return formatExcelDate(numeric, context.date1904);
  if (kind === "percent") return formatNumber(numeric * 100);
  return value.trim();
}

function parseSheet(xml: string, context: SheetContext): string[][] {
  const rows: (string[] | undefined)[] = [];

  for (const rowMatch of xml.matchAll(tagPattern("row"))) {
    const cells: (string | undefined)[] = [];
    for (const cellMatch of (rowMatch[2] ?? "").matchAll(tagPattern("c"))) {
      const tagBody = cellMatch[1] ?? "";
      const ref = attr(tagBody, "r");
      const columnIndex = ref ? columnIndexFromRef(ref) : cells.length;
      if (columnIndex >= 0) cells[columnIndex] = readCell(tagBody, cellMatch[2] ?? "", context);
    }

    const rowNumber = Number(attr(rowMatch[1] ?? "", "r"));
    const rowIndex = Number.isFinite(rowNumber) && rowNumber > 0 ? rowNumber - 1 : rows.length;
    rows[rowIndex] = Array.from({ length: cells.length }, (_unused, index) => cells[index] ?? "");
  }

  return Array.from({ length: rows.length }, (_unused, index) => rows[index] ?? []);
}

// ---------------------------------------------------------------------------
// Workbook
// ---------------------------------------------------------------------------

/** Sheets in workbook (tab) order, so "the first sheet" means the one the user sees first. */
export async function readXlsxSheets(buffer: ArrayBuffer): Promise<XlsxSheet[]> {
  const files = await unzip(buffer, "Excel");
  const utf8 = new TextDecoder("utf-8");
  const read = (path: string): string | undefined => {
    const data = files.get(path);
    return data === undefined ? undefined : utf8.decode(data);
  };

  const workbookXml = read("xl/workbook.xml");
  if (workbookXml === undefined) throw new Error("This doesn't look like an Excel workbook — xl/workbook.xml is missing.");

  const relationships = new Map<string, string>();
  for (const match of (read("xl/_rels/workbook.xml.rels") ?? "").matchAll(tagPattern("Relationship"))) {
    const id = attr(match[1] ?? "", "Id");
    const target = attr(match[1] ?? "", "Target");
    if (id && target) relationships.set(id, target);
  }

  const context: SheetContext = {
    sharedStrings: [...(read("xl/sharedStrings.xml") ?? "").matchAll(tagPattern("si"))].map((match) => textRuns(match[2] ?? "")),
    styles: parseStyles(read("xl/styles.xml")),
    date1904: /date1904="(1|true)"/.test(workbookXml),
  };

  const sheetsBlock = /<sheets\b[^>]*>([\s\S]*?)<\/sheets>/.exec(workbookXml)?.[1] ?? "";
  const sheets: XlsxSheet[] = [];
  let ordinal = 0;

  for (const match of sheetsBlock.matchAll(tagPattern("sheet"))) {
    ordinal += 1;
    const tagBody = match[1] ?? "";
    const relationshipId = attr(tagBody, "r:id");
    const target = (relationshipId ? relationships.get(relationshipId) : undefined) ?? `worksheets/sheet${ordinal}.xml`;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    const sheetXml = read(path);
    if (sheetXml === undefined) continue;
    sheets.push({
      name: decodeXmlEntities(attr(tagBody, "name") ?? `Sheet${ordinal}`),
      cells: parseSheet(sheetXml, context),
    });
  }

  if (sheets.length === 0) throw new Error("This Excel file has no readable worksheets.");
  return sheets;
}

// ---------------------------------------------------------------------------
// Sheet -> CSV
// ---------------------------------------------------------------------------

function normalizeHeaderCell(cell: string): string {
  return cell.replace(SORT_GLYPHS, " ").replace(/\s+/g, " ").trim();
}

function isAggregateRow(cells: string[]): boolean {
  return cells.some((cell) => AGGREGATE_ROW_LABELS.has(cell.trim().toLowerCase()));
}

function toCsvText(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

/**
 * Locates the header row by asking the caller whether a candidate row's
 * labels are a header it recognises, rather than assuming row 1 — a
 * Salesforce export buries the real header under a title and filter block.
 * Only columns whose header cell is non-empty are carried through, which
 * also drops the export's blank spacer columns either side of the table.
 * Returns null when this sheet has no recognised header row.
 */
export function sheetToCsvText(sheet: XlsxSheet, isHeaderRow: (headers: string[]) => boolean): string | null {
  for (let index = 0; index < sheet.cells.length; index++) {
    const candidate = (sheet.cells[index] ?? []).map(normalizeHeaderCell);
    const columns = candidate.flatMap((header, column) => (header === "" ? [] : [column]));
    if (columns.length === 0 || !isHeaderRow(columns.map((column) => candidate[column] ?? ""))) continue;

    const output: string[][] = [columns.map((column) => candidate[column] ?? "")];
    for (const row of sheet.cells.slice(index + 1)) {
      const selected = columns.map((column) => row[column] ?? "");
      if (selected.every((cell) => cell.trim() === "")) continue;
      if (isAggregateRow(row)) continue;
      output.push(selected);
    }
    return toCsvText(output);
  }

  return null;
}

/**
 * A Salesforce *summary/matrix* report pivots stages across the columns and
 * shows only "Sum of ..." / "Record Count" aggregates — the individual
 * opportunities aren't in the file at all, so no importer can recover them.
 * Worth naming explicitly: it is an easy report type to export by accident,
 * and "couldn't find a header row" gives no clue what to do about it.
 */
function looksLikeMatrixReport(sheet: XlsxSheet): boolean {
  for (const row of sheet.cells.slice(0, 40)) {
    let aggregateHeadings = 0;
    for (const cell of row) {
      const value = cell.trim();
      if (value.endsWith("→")) return true; // the pivot's axis label, e.g. "Stage →"
      if (/^sum of /i.test(value) || /^record count$/i.test(value)) aggregateHeadings += 1;
    }
    if (aggregateHeadings >= 2) return true;
  }
  return false;
}

/**
 * The row most likely *meant* to be the header of a sheet we couldn't match:
 * the first row of at least three non-empty cells that are all non-numeric.
 * Data rows almost always carry a number; header rows never do. Used only to
 * make the failure message specific about what the file actually contains.
 */
function likelyHeaderRow(sheet: XlsxSheet): string[] | null {
  for (const row of sheet.cells.slice(0, 40)) {
    const values = row.map(normalizeHeaderCell).filter((cell) => cell !== "");
    if (values.length >= 3 && values.every((value) => !Number.isFinite(Number(value)))) return values;
  }
  return null;
}

/**
 * Converts the first sheet containing a recognised header row into CSV
 * text. Throws with a readable message when no sheet does — far better than
 * silently importing a report's title block as data. `explainHeaderMiss`
 * lets the caller, which owns the column contracts, say what a near-miss
 * header was actually missing.
 */
export async function xlsxToCsvText(
  buffer: ArrayBuffer,
  isHeaderRow: (headers: string[]) => boolean,
  explainHeaderMiss?: (headers: string[]) => string | undefined,
): Promise<string> {
  const sheets = await readXlsxSheets(buffer);
  for (const sheet of sheets) {
    const csvText = sheetToCsvText(sheet, isHeaderRow);
    if (csvText !== null) return csvText;
  }

  const sheet = sheets[0]!;
  const alsoLooked = sheets.length > 1 ? ` (also looked in: ${sheets.slice(1).map((other) => other.name).join(", ")})` : "";

  if (looksLikeMatrixReport(sheet)) {
    throw new Error(
      `"${sheet.name}" is a Salesforce summary report — it holds only stage totals and record counts, ` +
        `not the individual opportunities, so there are no deals in it to import. Re-run the report in Salesforce ` +
        `with the Tabular (details) format and upload that instead${alsoLooked}.`,
    );
  }

  const candidate = likelyHeaderRow(sheet);
  const explanation = candidate ? explainHeaderMiss?.(candidate) : undefined;
  if (explanation) throw new Error(`"${sheet.name}": ${explanation}${alsoLooked}.`);

  throw new Error(
    candidate
      ? `"${sheet.name}" doesn't match either import format. Columns found: ${candidate.join(", ")}${alsoLooked}.`
      : `Couldn't find a header row in "${sheet.name}"${alsoLooked}.`,
  );
}
