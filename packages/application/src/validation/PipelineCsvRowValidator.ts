import { DealStage } from "@pulse-brazil/domain";

/**
 * Deterministic CSV row validation, kept entirely outside the domain model
 * per the "keep deterministic validation outside the model" rule — this
 * produces a plain draft or a list of errors; only a valid draft is ever
 * turned into a Deal (see ImportPipelineCsv). Column names are the real
 * Salesforce export headers verbatim (Title Case, with spaces) — confirmed
 * 2026-07-13 against the actual export, not a made-up snake_case contract.
 */
export interface DealDraft {
  rowNumber: number;
  opportunityOwner?: string;
  accountName: string;
  opportunityName: string;
  stage: DealStage;
  fiscalPeriod: string;
  amount: number;
  expectedRevenue: number;
  probabilityPercent: number;
  ageDays?: number;
  revenueLiveDate?: Date;
  nextStepSummary?: string;
  leadSource?: string;
  type?: string;
  ownerRegion?: string;
}

export interface PipelineCsvRowError {
  rowNumber: number;
  errors: string[];
}

export interface PipelineCsvValidationResult {
  valid: DealDraft[];
  invalid: PipelineCsvRowError[];
}

/** The fixed header contract, confirmed against the real export — see claude/INTEGRATION_PLAN.md Feature 1. */
export const REQUIRED_PIPELINE_CSV_COLUMNS = ["Account Name", "Opportunity Name", "Stage", "Amount", "Expected Revenue"] as const;

export const KNOWN_PIPELINE_CSV_COLUMNS = [
  "Opportunity Owner",
  "Account Name",
  "Opportunity Name",
  "Stage",
  "Fiscal Period",
  "Amount",
  "Expected Revenue",
  "Probability (%)",
  "Age",
  "Revenue Live Date",
  "Next Step Summary",
  "Lead Source",
  "Type",
  "Owner Region",
] as const;

/** Missing-required-column check happens once for the whole file, before any row is processed. */
export function validatePipelineCsvHeaders(headers: string[]): string[] {
  const present = new Set(headers.map((header) => header.toLowerCase()));
  return REQUIRED_PIPELINE_CSV_COLUMNS.filter((column) => !present.has(column.toLowerCase()));
}

/** True when a CSV's headers look like a Pipeline export rather than a Location one — used to auto-route uploads. */
export function looksLikePipelineCsv(headers: string[]): boolean {
  return validatePipelineCsvHeaders(headers).length === 0;
}

function parseStage(raw: string): DealStage | null {
  const match = Object.values(DealStage).find((stage) => stage.toLowerCase() === raw.trim().toLowerCase());
  return match ?? null;
}

function parseAmount(raw: string | undefined): number | undefined {
  if (!raw || !raw.trim()) return undefined;
  const value = Number(raw.trim());
  return Number.isFinite(value) ? value : undefined;
}

/** Real export dates are Brazilian format (DD/MM/YYYY), e.g. "13/01/2026" — not ISO. */
const BR_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function parseBrDate(raw: string | undefined): Date | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const match = BR_DATE_PATTERN.exec(trimmed);
  if (!match) return undefined;
  const [, day, month, year] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Validates one already-split CSV row against the fixed contract. Returns
 * either a draft (never a domain entity — construction happens later, once
 * account linkage is resolved) or a list of row-level errors. Fields not
 * needed for Pipeline Value / Top Open Deals (Age, Revenue Live Date, Next
 * Step Summary, Lead Source, Type, Owner Region, Opportunity Owner) are
 * parsed leniently — a malformed ancillary field doesn't reject an
 * otherwise-valid deal row.
 */
export function validatePipelineCsvRow(row: Record<string, string>, rowNumber: number): DealDraft | PipelineCsvRowError {
  const errors: string[] = [];

  const accountName = (row["Account Name"] ?? "").trim();
  if (!accountName) {
    errors.push("Account Name must not be empty");
  }

  const opportunityName = (row["Opportunity Name"] ?? "").trim();
  if (!opportunityName) {
    errors.push("Opportunity Name must not be empty");
  }

  const stageRaw = row["Stage"] ?? "";
  const stage = parseStage(stageRaw);
  if (!stage) {
    errors.push(`Stage must be one of: ${Object.values(DealStage).join(", ")} (got "${stageRaw}")`);
  }

  const amount = parseAmount(row["Amount"]);
  if (amount === undefined) {
    errors.push(`Amount is not a valid number: "${row["Amount"] ?? ""}"`);
  }

  const expectedRevenue = parseAmount(row["Expected Revenue"]);
  if (expectedRevenue === undefined) {
    errors.push(`Expected Revenue is not a valid number: "${row["Expected Revenue"] ?? ""}"`);
  }

  const probabilityRaw = row["Probability (%)"];
  const probabilityPercent = parseAmount(probabilityRaw) ?? 0;
  if (probabilityPercent < 0 || probabilityPercent > 100) {
    errors.push(`Probability (%) must be between 0 and 100, got "${probabilityRaw ?? ""}"`);
  }

  if (errors.length > 0) {
    return { rowNumber, errors };
  }

  return {
    rowNumber,
    opportunityOwner: row["Opportunity Owner"]?.trim() || undefined,
    accountName,
    opportunityName,
    stage: stage as DealStage,
    fiscalPeriod: (row["Fiscal Period"] ?? "").trim(),
    amount: amount as number,
    expectedRevenue: expectedRevenue as number,
    probabilityPercent,
    ageDays: parseAmount(row["Age"]),
    revenueLiveDate: parseBrDate(row["Revenue Live Date"]),
    nextStepSummary: row["Next Step Summary"]?.trim() || undefined,
    leadSource: row["Lead Source"]?.trim() || undefined,
    type: row["Type"]?.trim() || undefined,
    ownerRegion: row["Owner Region"]?.trim() || undefined,
  };
}

export function validatePipelineCsvRows(rows: Record<string, string>[]): PipelineCsvValidationResult {
  const valid: DealDraft[] = [];
  const invalid: PipelineCsvRowError[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // +1 for 1-indexing, +1 for the header row
    const result = validatePipelineCsvRow(row, rowNumber);
    if ("errors" in result) {
      invalid.push(result);
      return;
    }
    valid.push(result);
  });

  return { valid, invalid };
}
