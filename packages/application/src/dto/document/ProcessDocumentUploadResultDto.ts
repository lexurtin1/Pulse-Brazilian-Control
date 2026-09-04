import type { SignalDto } from "../signal/SignalDto.js";

/** What Document Ingest actually did: how Claude classified the file, the signals it created (linked to existing accounts only), mentions it couldn't match to any known account, and whether the Brazil update was refreshed. */
export interface ProcessDocumentUploadResultDto {
  sourceDocumentId: string;
  /** A DocumentType member name — what Claude read the file as, not what the uploader claimed. */
  documentType: string;
  signalsCreated: SignalDto[];
  unmatchedAccountMentions: string[];
  latestUpdateRefreshed: boolean;
  /**
   * Fields the Brazil update refused because they are pinned by a hand edit.
   * Non-empty means the card did not fully move — the uploader is told, and
   * can release the pin from the card itself.
   */
  latestUpdateBlockedFields: string[];
}
