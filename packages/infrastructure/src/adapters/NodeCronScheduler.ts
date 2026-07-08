import type { IScheduler, ScheduledJobHandle } from "@pulse-brazil/application";
import cron from "node-cron";

/** Satisfies IScheduler using the node-cron package. */
export class NodeCronScheduler implements IScheduler {
  schedule(cronExpression: string, timezone: string, job: () => Promise<void>): ScheduledJobHandle {
    const task = cron.schedule(
      cronExpression,
      async () => {
        try {
          await job();
        } catch (error) {
          // job contract says don't throw — belt-and-suspenders catch here
          console.error("[NodeCronScheduler] Unhandled error in scheduled job:", error);
        }
      },
      { timezone },
    );
    return { cancel: () => task.stop() };
  }
}
