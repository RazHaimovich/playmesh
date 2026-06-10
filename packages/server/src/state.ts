import type { Redis } from 'ioredis';

/**
 * Backing store for synchronized runtime state. Values are scoped by a
 * namespace (one per instance) and serialized as JSON.
 */
export interface StateStore {
  get(namespace: string, key: string): Promise<unknown>;
  set(namespace: string, key: string, value: unknown): Promise<void>;
  delete(namespace: string, key: string): Promise<void>;
  keys(namespace: string): Promise<string[]>;
  clear(namespace: string): Promise<void>;
}

export class MemoryStateStore implements StateStore {
  private readonly namespaces = new Map<string, Map<string, unknown>>();

  private ns(namespace: string): Map<string, unknown> {
    let map = this.namespaces.get(namespace);
    if (!map) {
      map = new Map();
      this.namespaces.set(namespace, map);
    }
    return map;
  }

  async get(namespace: string, key: string): Promise<unknown> {
    return this.ns(namespace).get(key);
  }

  async set(namespace: string, key: string, value: unknown): Promise<void> {
    this.ns(namespace).set(key, value);
  }

  async delete(namespace: string, key: string): Promise<void> {
    this.ns(namespace).delete(key);
  }

  async keys(namespace: string): Promise<string[]> {
    return [...this.ns(namespace).keys()];
  }

  async clear(namespace: string): Promise<void> {
    this.namespaces.delete(namespace);
  }
}

export class RedisStateStore implements StateStore {
  constructor(private readonly redis: Redis) {}

  private hashKey(namespace: string): string {
    return `playmesh:state:${namespace}`;
  }

  async get(namespace: string, key: string): Promise<unknown> {
    const raw = await this.redis.hget(this.hashKey(namespace), key);
    return raw === null ? undefined : JSON.parse(raw);
  }

  async set(namespace: string, key: string, value: unknown): Promise<void> {
    await this.redis.hset(this.hashKey(namespace), key, JSON.stringify(value));
  }

  async delete(namespace: string, key: string): Promise<void> {
    await this.redis.hdel(this.hashKey(namespace), key);
  }

  async keys(namespace: string): Promise<string[]> {
    return this.redis.hkeys(this.hashKey(namespace));
  }

  async clear(namespace: string): Promise<void> {
    await this.redis.del(this.hashKey(namespace));
  }
}

/**
 * State API exposed on an Instance, bound to that instance's namespace.
 * The store is resolved lazily so the backing implementation can switch
 * from memory to Redis when the server starts.
 */
export class ScopedState {
  constructor(
    private readonly store: () => StateStore,
    private readonly namespace: string
  ) {}

  get(key: string): Promise<unknown> {
    return this.store().get(this.namespace, key);
  }

  set(key: string, value: unknown): Promise<void> {
    return this.store().set(this.namespace, key, value);
  }

  delete(key: string): Promise<void> {
    return this.store().delete(this.namespace, key);
  }

  keys(): Promise<string[]> {
    return this.store().keys(this.namespace);
  }

  clear(): Promise<void> {
    return this.store().clear(this.namespace);
  }
}
