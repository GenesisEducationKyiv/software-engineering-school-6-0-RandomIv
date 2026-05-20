import cron, { ScheduledTask } from 'node-cron';
import { SchedulerPort } from '../../application/ports/scheduler.port';
import { LoggerPort } from '../../application/ports/logger.port';

export class NodeCronScheduler implements SchedulerPort {
  private task: ScheduledTask | null = null;

  constructor(
    private readonly expression: string,
    private readonly logger: LoggerPort,
  ) {}

  schedule(work: () => Promise<void> | void): void {
    this.task = cron.schedule(this.expression, async () => {
      this.logger.info(`[Scheduler] Tick at ${new Date().toISOString()}`);
      try { await work(); }
      catch (error) { this.logger.error({ err: error }, '[Scheduler] Task threw'); }
    });
    this.logger.info(`[Scheduler] Initialized (${this.expression})`);
  }

  async stop(): Promise<void> {
    if (!this.task) return;
    await this.task.stop();
    this.task = null;
  }
}
