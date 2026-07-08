export interface ScheduledJobHandle {
  /** Stops the job from firing again. Idempotent. */
  cancel(): void;
}

export interface IScheduler {
  /**
   * Schedule a job to run on a cron expression.
   * @param cronExpression Standard 5-field cron: "0 7 * * *" = 07:00 every day
   * @param timezone       IANA timezone string e.g. "America/Sao_Paulo"
   * @param job            Async function to execute — must not throw; errors
   *                       should be caught internally and logged
   * @returns              A handle that can cancel the job
   */
  schedule(cronExpression: string, timezone: string, job: () => Promise<void>): ScheduledJobHandle;
}
