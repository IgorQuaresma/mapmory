import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { Design } from '@mapmory/design-schema';

export const EXPORT_QUEUES = { small: 'export-small', large: 'export-large' } as const;
export interface ExportJobData {
  exportId: string;
}

/** Jobs are split by size class so one A0 render can't block many A4 jobs (plan §7.3). */
export function sizeClass(design: Pick<Design, 'page'>): keyof typeof EXPORT_QUEUES {
  const { w, h } = design.page.trimMm;
  return w * h <= 297 * 420 + 1 ? 'small' : 'large';
}

export function createExportQueues(redisUrl: string) {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queues = {
    small: new Queue<ExportJobData>(EXPORT_QUEUES.small, { connection }),
    large: new Queue<ExportJobData>(EXPORT_QUEUES.large, { connection }),
  };
  return {
    async enqueue(design: Pick<Design, 'page'>, exportId: string) {
      await queues[sizeClass(design)].add(
        'export',
        { exportId },
        { jobId: exportId, attempts: 2, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: 1000, removeOnFail: 1000 },
      );
    },
    async close() {
      await Promise.all([queues.small.close(), queues.large.close()]);
      connection.disconnect();
    },
  };
}
export type ExportQueues = ReturnType<typeof createExportQueues>;
