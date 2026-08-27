import { describe, expect, it } from "vitest";
import { docxToText } from "./docx";
import { zipFixture } from "./zip.fixture";

/**
 * A .docx is a ZIP of WordprocessingML, so fixtures are built here the same
 * way the Excel ones are — see zip.fixture for why nothing is committed.
 * What is under test is not fidelity but meaning-preservation: Claude reads
 * this text, so word order and paragraph boundaries matter and formatting
 * does not.
 */

function docx(documentXml: string): ArrayBuffer {
  return zipFixture([
    { name: "[Content_Types].xml", text: `<Types/>` },
    { name: "word/document.xml", text: `<?xml version="1.0" encoding="UTF-8"?><w:document><w:body>${documentXml}</w:body></w:document>` },
  ]);
}

const paragraph = (...runs: string[]) => `<w:p><w:r>${runs.map((run) => `<w:t>${run}</w:t>`).join("")}</w:r></w:p>`;

describe("docxToText", () => {
  it("reads the text of a simple document", async () => {
    const text = await docxToText(docx(paragraph("Call with Itaú")));

    expect(text).toBe("Call with Itaú");
  });

  it("joins the runs Word splits a sentence into", async () => {
    // Word splits a single sentence across runs at every formatting change,
    // so "agreed to a **pilot** in Q4" arrives as three separate <w:t>s.
    const text = await docxToText(docx(paragraph("They agreed to a ", "pilot", " in Q4")));

    expect(text).toBe("They agreed to a pilot in Q4");
  });

  it("keeps paragraphs apart rather than welding them together", async () => {
    const text = await docxToText(docx(paragraph("Spoke to Ana on Thursday.") + paragraph("We agreed to send pricing.")));

    expect(text).toBe("Spoke to Ana on Thursday.\nWe agreed to send pricing.");
  });

  it("turns tabs and line breaks inside a run into spaces", async () => {
    const text = await docxToText(docx(`<w:p><w:r><w:t>Owner</w:t><w:tab/><w:t>Ana</w:t><w:br/><w:t>Stage</w:t></w:r></w:p>`));

    expect(text).toBe("Owner Ana Stage");
  });

  it("keeps table cells and rows readable", async () => {
    const table = `<w:tbl><w:tr><w:tc>${paragraph("Account")}</w:tc><w:tc>${paragraph("Stage")}</w:tc></w:tr><w:tr><w:tc>${paragraph("Itaú")}</w:tc><w:tc>${paragraph("Proposal")}</w:tc></w:tr></w:tbl>`;

    const text = await docxToText(docx(table));

    expect(text).toBe("Account\tStage\nItaú\tProposal");
  });

  it("decodes XML entities without double-decoding", async () => {
    const text = await docxToText(docx(paragraph("Ana &amp; Bruno said &quot;yes&quot; &amp;lt; 5%")));

    expect(text).toBe('Ana & Bruno said "yes" &lt; 5%');
  });

  it("collapses the blank lines empty paragraphs leave behind", async () => {
    const text = await docxToText(docx(paragraph("First") + "<w:p/><w:p/><w:p/>" + paragraph("Second")));

    expect(text).toBe("First\n\nSecond");
  });

  it("rejects a file with no document part rather than ingesting nothing", async () => {
    await expect(docxToText(zipFixture([{ name: "word/settings.xml", text: "<w:settings/>" }]))).rejects.toThrow(
      /no word\/document\.xml/,
    );
  });

  it("rejects a document with no readable text and says what to do instead", async () => {
    await expect(docxToText(docx("<w:p/>"))).rejects.toThrow(/no readable text/);
  });

  it("rejects a file that isn't a ZIP at all", async () => {
    await expect(docxToText(new TextEncoder().encode("Not a Word file").buffer as ArrayBuffer)).rejects.toThrow(/Word file/);
  });
});
