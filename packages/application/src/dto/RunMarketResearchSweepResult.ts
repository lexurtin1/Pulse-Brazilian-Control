export interface RunMarketResearchSweepError {
  topic: string;
  message: string;
}

export interface RunMarketResearchSweepResult {
  topicsProcessed: number;
  signalsCreated: number;
  errors: RunMarketResearchSweepError[];
}
