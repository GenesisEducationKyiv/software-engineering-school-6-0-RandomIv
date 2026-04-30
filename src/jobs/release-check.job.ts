import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { config } from '../config';
import { checkReleases } from '../modules/scanner/scanner.service';

export const initReleaseCheckJob = (): ScheduledTask => {
  const task = cron.schedule(config.RELEASE_CHECK_CRON, async () => {
    console.log(`[Job] Release check at ${new Date().toISOString()}`);
    await checkReleases();
  });

  console.log(
    `[Job] Release check initialized (${config.RELEASE_CHECK_CRON})`,
  );

  return task;
};
