import {
  type AccountId,
  asAccountId,
  asContextBundleId,
  asSignalId,
  ContextBundle,
  EvidenceKind,
  EvidenceReference,
  type SignalId,
} from "@pulse-brazil/domain";
import { NotFoundError, ValidationError } from "../../errors/ApplicationError.js";
import type { IContextBundleRepository } from "../../ports/IContextBundleRepository.js";
import type { IDocumentRepository } from "../../ports/IDocumentRepository.js";
import type { IIdGenerator } from "../../ports/IIdGenerator.js";
import type { INoteRepository } from "../../ports/INoteRepository.js";
import type { ISignalRepository } from "../../ports/ISignalRepository.js";

export interface BuildContextBundleCommand {
  accountId: string;
  /** Specific signals to focus on. When omitted, every signal already linked to the account is included. */
  signalIds?: string[];
}

/**
 * Assembles exactly what evidence Claude will be given for a single
 * reasoning call: the account's notes, its source documents, and its
 * signals — turned into EvidenceReferences and wrapped in a ContextBundle.
 * This is the application layer's half of "Claude should not be given
 * uncontrolled context by default"; the domain only defines the shape.
 *
 * Returns the domain ContextBundle itself, not a DTO — this is an internal
 * orchestration step consumed by GenerateInsight, not a presentation-facing
 * endpoint. Routing it through a DTO would just force GenerateInsight to
 * immediately reconstruct the domain object it needs to pass to IClaudeService.
 */
export class BuildContextBundle {
  constructor(
    private readonly notes: INoteRepository,
    private readonly documents: IDocumentRepository,
    private readonly signals: ISignalRepository,
    private readonly contextBundles: IContextBundleRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(command: BuildContextBundleCommand): Promise<ContextBundle> {
    if (!command.accountId.trim()) {
      throw new ValidationError("accountId is required to build a context bundle");
    }
    const accountId = asAccountId(command.accountId);

    const [accountNotes, accountDocuments] = await Promise.all([
      this.notes.findByAccountId(accountId),
      this.documents.findByAccountId(accountId),
    ]);

    const signals = await this.resolveSignals(accountId, command.signalIds);

    const evidence = [
      ...accountNotes.map((note) => EvidenceReference.of({ kind: EvidenceKind.Note, referenceId: note.id })),
      ...accountDocuments.map((document) =>
        EvidenceReference.of({ kind: EvidenceKind.SourceDocument, referenceId: document.id }),
      ),
      ...signals.map((signal) => EvidenceReference.of({ kind: EvidenceKind.Signal, referenceId: signal.id })),
    ];

    const bundle = ContextBundle.of({
      id: asContextBundleId(this.idGenerator.newId()),
      assembledAt: new Date(),
      evidence,
      subjectAccountId: accountId,
    });

    await this.contextBundles.save(bundle);
    return bundle;
  }

  private async resolveSignals(accountId: AccountId, signalIds: string[] | undefined) {
    if (!signalIds || signalIds.length === 0) {
      return this.signals.findByAccountId(accountId);
    }
    const resolved = await Promise.all(
      signalIds.map(async (rawId) => {
        const signalId: SignalId = asSignalId(rawId);
        const signal = await this.signals.findById(signalId);
        if (!signal) {
          throw new NotFoundError("Signal", rawId);
        }
        return signal;
      }),
    );
    return resolved;
  }
}
