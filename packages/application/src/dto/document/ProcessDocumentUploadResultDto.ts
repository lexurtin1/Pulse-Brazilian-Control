import type { SignalDto } from "../signal/SignalDto.js";

/** What Document Ingest actually did: signals it created (linked to existing accounts only) and mentions it couldn't match to any known account. */
export interface ProcessDocumentUploadResultDto {
  sourceDocumentId: string;
  signalsCreated: SignalDto[];
  unmatchedAccountMentions: string[];
}
