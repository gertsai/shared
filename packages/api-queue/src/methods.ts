// SPDX-License-Identifier: Apache-2.0
/**
 * Moleculer service-methods factory for BullMQ queues.
 *
 * Returns the `getQueue` / `addJob` methods that `ApiController.generateServiceSchema()`
 * attaches under `schema.methods`. They are bound at runtime to the Moleculer
 * service instance via `this`, so the returned record is a plain `Record<string,
 * Function>` shaped exactly the way Moleculer expects.
 *
 * Wave 15.B — extracted from `ApiController.class.ts` lines 1082-1116.
 */

import { Queue } from 'bullmq';
import type { Job } from 'bullmq';

import type { BullMQConnectionOptions } from './types';

/**
 * Factory output: empty record when `queueConfig` is missing (matches the
 * original `...(ApiController._config.queue && { ... })` spread behaviour),
 * otherwise a `{ getQueue, addJob }` record ready to be mixed into the
 * Moleculer service schema's `methods` block.
 */
export type QueueServiceMethods = Record<string, unknown>;

/**
 * Build the queue service methods. Returns an empty object when
 * `queueConfig` is not provided (matches api-core's conditional-spread
 * pattern).
 *
 * Methods are intentionally not arrow functions — Moleculer binds `this`
 * to the service instance at registration time, and `this.$queues` is the
 * runtime queue cache populated in `started()`.
 */
export function createQueueServiceMethods(
  queueConfig: BullMQConnectionOptions | undefined,
): QueueServiceMethods {
  if (!queueConfig) return {};

  return {
    /**
     * Get a queue by name (BullMQ).
     *
     * @param {String} name - Queue's name
     * @returns {Queue}
     */
    getQueue(this: { $queues: Record<string, Queue> }, name: string): Queue {
      const queues = this.$queues;
      if (!queues[name]) {
        queues[name] = new Queue(name, {
          connection: queueConfig.connection,
          ...(queueConfig.defaultJobOptions !== undefined && {
            defaultJobOptions: queueConfig.defaultJobOptions,
          }),
          ...(queueConfig.prefix !== undefined && { prefix: queueConfig.prefix }),
        });
      }
      return queues[name];
    },
    /**
     * Add a job to the queue (BullMQ).
     *
     * @param {String} name - Queue name
     * @param {String} jobName - Job name
     * @param {Any} payload - Job data
     * @param {Any} opts - Job options
     * @returns {Promise<Job>}
     */
    async addJob(
      this: { $queues: Record<string, Queue>; getQueue: (name: string) => Queue },
      name: string,
      jobName: string,
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      payload: any,
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      opts: any,
    ): Promise<Job> {
      const queue = this.getQueue(name);
      return queue.add(jobName || '*', payload || {}, opts || {});
    },
  };
}
