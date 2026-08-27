import { describe, expect, it } from "vitest";
import { looksLikePipelineCsv } from "./PipelineCsvRowValidator.js";
import { looksLikeSalesforceAccountCsv } from "./SalesforceAccountCsvRowValidator.js";
import { validateLocationCsvHeaders } from "./LocationCsvRowValidator.js";

/**
 * These header sets are the real ones from Everything Brazil/, transcribed
 * as column names only — no rows, so no customer data enters the repo.
 *
 * The routing they drive is not cosmetic: an account export sent to the
 * pipeline importer would create deals out of accounts, and a pipeline
 * export sent to reconcile would silently rewrite account metadata. Both
 * carry "Account Name", so that column can never be the discriminator.
 */

const ACCOUNT_EXPORT_HEADERS = [
  "Account Name",
  "Client Type",
  "Client Country",
  "Status",
  "# Open Opportunities",
  "CTN ID",
  "Description",
  "Website",
  "Rank",
  "Account Owner",
  "Created Date",
];

const OPPORTUNITY_EXPORT_HEADERS = [
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
];

const LOCATION_HEADERS = ["record_kind", "label", "raw_address", "city"];

describe("looksLikeSalesforceAccountCsv", () => {
  it("recognises the real account export", () => {
    expect(looksLikeSalesforceAccountCsv(ACCOUNT_EXPORT_HEADERS)).toBe(true);
  });

  it("does not claim the opportunity export, which also carries Account Name", () => {
    expect(looksLikeSalesforceAccountCsv(OPPORTUNITY_EXPORT_HEADERS)).toBe(false);
    expect(looksLikePipelineCsv(OPPORTUNITY_EXPORT_HEADERS)).toBe(true);
  });

  it("does not claim a location CSV", () => {
    expect(looksLikeSalesforceAccountCsv(LOCATION_HEADERS)).toBe(false);
    expect(validateLocationCsvHeaders(LOCATION_HEADERS)).toEqual([]);
  });

  it("is case-insensitive, as Salesforce exports vary in casing", () => {
    expect(looksLikeSalesforceAccountCsv(["ACCOUNT NAME", "status", "Client Type"])).toBe(true);
  });

  it("yields to pipeline when a sheet somehow satisfies both", () => {
    // Nothing observed exports both "Status" and the full opportunity
    // contract, but if one ever did, treating it as pipeline data is the
    // safe reading: it appends deals rather than rewriting account metadata.
    const both = [...OPPORTUNITY_EXPORT_HEADERS, "Status"];

    expect(looksLikePipelineCsv(both)).toBe(true);
    expect(looksLikeSalesforceAccountCsv(both)).toBe(false);
  });

  it("rejects an account export missing Status", () => {
    expect(looksLikeSalesforceAccountCsv(["Account Name", "Client Type", "Account Owner"])).toBe(false);
  });

  it("each of the three contracts claims exactly one of the three real header sets", () => {
    const claims = (headers: string[]) =>
      [
        looksLikePipelineCsv(headers) && "pipeline",
        looksLikeSalesforceAccountCsv(headers) && "accounts",
        validateLocationCsvHeaders(headers).length === 0 && "location",
      ].filter(Boolean);

    expect(claims(OPPORTUNITY_EXPORT_HEADERS)).toEqual(["pipeline"]);
    expect(claims(ACCOUNT_EXPORT_HEADERS)).toEqual(["accounts"]);
    expect(claims(LOCATION_HEADERS)).toEqual(["location"]);
  });
});
