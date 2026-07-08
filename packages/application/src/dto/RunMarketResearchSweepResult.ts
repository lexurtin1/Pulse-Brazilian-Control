export interface RunMarketResearchSweepError {
  accountId: string;
  message: string;
}

export interface RunMarketResearchSweepResult {
  accountsProcessed: number;
  signalsCreated: number;
  errors: RunMarketResearchSweepError[];
}
