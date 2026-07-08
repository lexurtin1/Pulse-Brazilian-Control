/** Where an uploaded document sits in the pipeline from raw upload to linked intelligence. */
export enum IngestionState {
  Received = "Received",
  Processing = "Processing",
  Classified = "Classified",
  Linked = "Linked",
  Failed = "Failed",
}

const ALLOWED_TRANSITIONS: Record<IngestionState, readonly IngestionState[]> = {
  [IngestionState.Received]: [IngestionState.Processing, IngestionState.Failed],
  [IngestionState.Processing]: [IngestionState.Classified, IngestionState.Failed],
  [IngestionState.Classified]: [IngestionState.Linked, IngestionState.Failed],
  [IngestionState.Linked]: [],
  [IngestionState.Failed]: [IngestionState.Processing],
};

export function canTransitionIngestionState(from: IngestionState, to: IngestionState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
