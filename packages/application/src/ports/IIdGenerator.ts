/**
 * The domain never generates its own identifiers — every entity is
 * constructed with an id supplied by its caller. Use cases that create a
 * brand-new aggregate (CreateAccount, CreateSignal, CreateNote,
 * SubmitDocument, GenerateInsight, BuildContextBundle) depend on this port
 * to get one, so the actual generation strategy (uuid, crypto.randomUUID,
 * a DB sequence) stays an infrastructure decision.
 */
export interface IIdGenerator {
  newId(): string;
}
