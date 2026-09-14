/**
 * Small RFC 4180 CSV reader/writer. No external library: the inputs are
 * hand-made spreadsheets exports, and we need control over limits and escaping.
 */

export type CsvParseResult = {
  headers: string[];
  rows: Record<string, string>[];
};

export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvError";
  }
}

const DEFAULT_MAX_ROWS = 2000;

export function parseCsv(text: string, opts: { maxRows?: number } = {}): CsvParseResult {
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      records.push(record);
      record = [];
    } else {
      field += ch;
    }
  }
  if (inQuotes) throw new CsvError("Unterminated quoted field.");
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonEmpty.length === 0) throw new CsvError("The file is empty.");

  const headers = nonEmpty[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const dupHeader = headers.find((h, i) => h && headers.indexOf(h) !== i);
  if (dupHeader) throw new CsvError(`Duplicate column "${dupHeader}".`);

  const body = nonEmpty.slice(1);
  if (body.length > maxRows)
    throw new CsvError(`Too many rows (${body.length}). Maximum is ${maxRows}.`);

  const rows = body.map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });
  return { headers, rows };
}

/**
 * Neutralise spreadsheet formula injection: a cell starting with = + - @ or a tab/CR
 * would be executed by Excel/Sheets when the CSV is opened. Prefix with an apostrophe.
 */
export function csvSafeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function quote(value: string): string {
  const v = csvSafeCell(value);
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(quote).join(",")];
  for (const r of rows)
    lines.push(r.map((c) => quote(c === null || c === undefined ? "" : String(c))).join(","));
  return lines.join("\r\n") + "\r\n";
}
