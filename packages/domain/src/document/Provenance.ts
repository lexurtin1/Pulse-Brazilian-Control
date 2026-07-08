import { ConnectorSource } from "../shared/ConnectorSource.js";
import { ExternalReference } from "../shared/ExternalReference.js";

/** Where a document came from and who brought it in — the audit trail for provenance, not its content. */
export class Provenance {
  private constructor(
    readonly connectorSource: ConnectorSource,
    readonly uploadedAt: Date,
    readonly uploadedBy?: string,
    readonly originalFilename?: string,
    readonly externalReference?: ExternalReference,
  ) {}

  static of(params: {
    connectorSource: ConnectorSource;
    uploadedAt: Date;
    uploadedBy?: string;
    originalFilename?: string;
    externalReference?: ExternalReference;
  }): Provenance {
    return new Provenance(
      params.connectorSource,
      params.uploadedAt,
      params.uploadedBy?.trim() || undefined,
      params.originalFilename?.trim() || undefined,
      params.externalReference,
    );
  }
}
