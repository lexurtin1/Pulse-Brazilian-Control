/**
 * Minimal RFC4180-ish CSV parser — quoted fields (with embedded commas,
 * quotes, and newlines) and bare fields, comma-delimited, header row
 * required. No npm dependency: this is a small, self-contained algorithm,
 * consistent with the project's dependency-conservatism (see
 * GeocoderAdapter's native-fetch precedent).
 */
export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

function splitCsvLines(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }

  return rows;
}

export function parseLocationCsv(csvText: string): ParsedCsv {
  const lines = splitCsvLines(csvText);
  const [headerLine, ...dataLines] = lines;
  const headers = (headerLine ?? []).map((header) => header.trim());

  const rows = dataLines.map((line) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = (line[index] ?? "").trim();
    });
    return record;
  });

  return { headers, rows };
}
