import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { logger } from '../core/logger';
import { ScannerService } from '../modules/scanner/scanner.service';

export class ReleaseCheckScheduler {
  private isRunning = false;

  constructor(
    private readonly scannerService: ScannerService,
    private readonly schedule: string,
  ) {}

  start(): ScheduledTask {
    const task = cron.schedule(this.schedule, async () => {
      if (this.isRunning) {
        logger.warn('[Scheduler] Previous release check still running, skipping');
        return;
      }
      this.isRunning = true;
      logger.info(`[Scheduler] Release check at ${new Date().toISOString()}`);
      try {
        await this.scannerService.checkReleases();
      } catch (error) {
        logger.error({ err: error }, '[Scheduler] Release check failed');
      } finally {
        this.isRunning = false;
      }
    });
    logger.info(`[Scheduler] Release check initialized (${this.schedule})`);
    return task;
  }
}
