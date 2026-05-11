import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { logger } from '../common/logger/logger';
import { ScannerService } from '../modules/scanner/scanner.service';

export class ReleaseCheckJob {
  constructor(
    private readonly scannerService: ScannerService,
    private readonly schedule: string,
  ) {}

  start(): ScheduledTask {
    const task = cron.schedule(this.schedule, async () => {
      logger.info(`[Job] Release check at ${new Date().toISOString()}`);
      await this.scannerService.checkReleases();
    });

    logger.info(`[Job] Release check initialized (${this.schedule})`);

    return task;
  }
}