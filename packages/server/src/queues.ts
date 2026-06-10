import { Queue, Worker, type Processor, type WorkerOptions, type QueueOptions } from 'bullmq';
import type { RedisOptions } from 'ioredis';

/**
 * Thin wrapper around BullMQ that shares the mesh's Redis connection
 * options. Queues and workers created here are closed on shutdown.
 */
export class QueueManager {
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];

  constructor(private readonly connection: RedisOptions) {}

  queue(name: string, options?: Omit<QueueOptions, 'connection'>): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { ...options, connection: this.connection });
      this.queues.set(name, queue);
    }
    return queue;
  }

  worker(
    name: string,
    processor: Processor,
    options?: Omit<WorkerOptions, 'connection'>
  ): Worker {
    const worker = new Worker(name, processor, {
      ...options,
      connection: this.connection
    });
    this.workers.push(worker);
    return worker;
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map(worker => worker.close()));
    await Promise.all([...this.queues.values()].map(queue => queue.close()));
    this.workers.length = 0;
    this.queues.clear();
  }
}
