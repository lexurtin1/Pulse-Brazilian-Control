import type { IDocumentRepository } from "@pulse-brazil/application";
import {
  type AccountId,
  asAccountId,
  asDocumentId,
  asInsightId,
  asThemeId,
  ConnectorSource,
  type DocumentId,
  DocumentType,
  ExternalReference,
  ExternalSystem,
  IngestionState,
  Provenance,
  SourceDocument,
} from "@pulse-brazil/domain";
import type { Pool } from "pg";

interface ExternalReferenceJson {
  system: string;
  externalId: string;
  url: string | null;
}

interface ProvenanceJson {
  connectorSource: string;
  uploadedAt: string;
  uploadedBy: string | null;
  originalFilename: string | null;
  externalReference: ExternalReferenceJson | null;
}

interface DocumentRow {
  id: string;
  declared_type: string;
  inferred_type: string | null;
  linked_account_id: string | null;
  linked_theme_ids: string[];
  ingestion_state: string;
  extracted_references: string[];
  provenance: ProvenanceJson;
}

function provenanceFromJson(json: ProvenanceJson): Provenance {
  return Provenance.of({
    connectorSource: json.connectorSource as ConnectorSource,
    uploadedAt: new Date(json.uploadedAt),
    uploadedBy: json.uploadedBy ?? undefined,
    originalFilename: json.originalFilename ?? undefined,
    externalReference: json.externalReference
      ? ExternalReference.of({
          system: json.externalReference.system as ExternalSystem,
          externalId: json.externalReference.externalId,
          url: json.externalReference.url ?? undefined,
        })
      : undefined,
  });
}

function provenanceToJson(provenance: Provenance): ProvenanceJson {
  return {
    connectorSource: provenance.connectorSource,
    uploadedAt: provenance.uploadedAt.toISOString(),
    uploadedBy: provenance.uploadedBy ?? null,
    originalFilename: provenance.originalFilename ?? null,
    externalReference: provenance.externalReference
      ? {
          system: provenance.externalReference.system,
          externalId: provenance.externalReference.externalId,
          url: provenance.externalReference.url ?? null,
        }
      : null,
  };
}

/**
 * Reaches the stored ingestionState by replaying transitionTo() from
 * Received — the same state machine the domain enforces prospectively.
 * Every reachable state is at most 3 hops away (Received -> Processing ->
 * Classified -> Linked); Failed is reachable directly.
 */
function replayToIngestionState(document: SourceDocument, target: IngestionState): SourceDocument {
  switch (target) {
    case IngestionState.Received:
      return document;
    case IngestionState.Processing:
      return document.transitionTo(IngestionState.Processing);
    case IngestionState.Classified:
      return document.transitionTo(IngestionState.Processing).transitionTo(IngestionState.Classified);
    case IngestionState.Linked:
      return document
        .transitionTo(IngestionState.Processing)
        .transitionTo(IngestionState.Classified)
        .transitionTo(IngestionState.Linked);
    case IngestionState.Failed:
      return document.transitionTo(IngestionState.Failed);
  }
}

function rowToDocument(row: DocumentRow): SourceDocument {
  try {
    let document = SourceDocument.receive({
      id: asDocumentId(row.id),
      declaredType: row.declared_type as DocumentType,
      linkedAccountId: row.linked_account_id ? asAccountId(row.linked_account_id) : undefined,
      linkedThemeIds: row.linked_theme_ids.map(asThemeId),
      provenance: provenanceFromJson(row.provenance),
    });

    if (row.inferred_type) {
      document = document.withInferredType(row.inferred_type as DocumentType);
    }
    // extractedReferences is InsightId | SignalId; the brand is erased at
    // runtime, so re-branding every stored id as InsightId satisfies the
    // union without needing to know which one it originally was.
    for (const reference of row.extracted_references) {
      document = document.withExtractedReference(asInsightId(reference));
    }

    return replayToIngestionState(document, row.ingestion_state as IngestionState);
  } catch (error) {
    throw new Error(`Failed to reconstruct SourceDocument ${row.id} from row: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Satisfies IDocumentRepository. No ORM — plain parameterised SQL against the documents table (see migrations/003_create_documents.sql). */
export class PostgresDocumentRepository implements IDocumentRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: DocumentId): Promise<SourceDocument | null> {
    const { rows } = await this.pool.query<DocumentRow>("SELECT * FROM documents WHERE id = $1", [id]);
    const [row] = rows;
    return row ? rowToDocument(row) : null;
  }

  async findByAccountId(accountId: AccountId): Promise<SourceDocument[]> {
    const { rows } = await this.pool.query<DocumentRow>(
      "SELECT * FROM documents WHERE linked_account_id = $1 ORDER BY created_at DESC",
      [accountId],
    );
    return rows.map(rowToDocument);
  }

  async save(document: SourceDocument): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO documents (
        id, declared_type, inferred_type, linked_account_id, linked_theme_ids,
        ingestion_state, extracted_references, provenance
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        declared_type = EXCLUDED.declared_type,
        inferred_type = EXCLUDED.inferred_type,
        linked_account_id = EXCLUDED.linked_account_id,
        linked_theme_ids = EXCLUDED.linked_theme_ids,
        ingestion_state = EXCLUDED.ingestion_state,
        extracted_references = EXCLUDED.extracted_references,
        provenance = EXCLUDED.provenance
      `,
      [
        document.id,
        document.declaredType,
        document.inferredType ?? null,
        document.linkedAccountId ?? null,
        JSON.stringify(document.linkedThemeIds),
        document.ingestionState,
        JSON.stringify(document.extractedReferences),
        JSON.stringify(provenanceToJson(document.provenance)),
      ],
    );
  }
}
