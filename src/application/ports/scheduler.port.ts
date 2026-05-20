export interface SchedulerPort {
  schedule(task: () => Promise<void> | void): void;
  stop(): Promise<void>;
}
