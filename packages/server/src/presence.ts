import type { Redis } from 'ioredis';

/**
 * Presence tracks which sessions are online and which sessions are in
 * which instance. In multi-node deployments the Redis implementation
 * gives every node the same view.
 */
export interface Presence {
  sessionConnected(sessionId: string, userId: string): Promise<void>;
  sessionDisconnected(sessionId: string, userId: string): Promise<void>;
  joined(instancePath: string, sessionId: string): Promise<void>;
  left(instancePath: string, sessionId: string): Promise<void>;
  onlineCount(): Promise<number>;
  onlineUserIds(): Promise<string[]>;
  instanceCount(instancePath: string): Promise<number>;
  instanceMembers(instancePath: string): Promise<string[]>;
}

export class MemoryPresence implements Presence {
  private readonly sessions = new Map<string, string>();
  private readonly instances = new Map<string, Set<string>>();

  async sessionConnected(sessionId: string, userId: string): Promise<void> {
    this.sessions.set(sessionId, userId);
  }

  async sessionDisconnected(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async joined(instancePath: string, sessionId: string): Promise<void> {
    let members = this.instances.get(instancePath);
    if (!members) {
      members = new Set();
      this.instances.set(instancePath, members);
    }
    members.add(sessionId);
  }

  async left(instancePath: string, sessionId: string): Promise<void> {
    const members = this.instances.get(instancePath);
    members?.delete(sessionId);
    if (members && members.size === 0) this.instances.delete(instancePath);
  }

  async onlineCount(): Promise<number> {
    return this.sessions.size;
  }

  async onlineUserIds(): Promise<string[]> {
    return [...new Set(this.sessions.values())];
  }

  async instanceCount(instancePath: string): Promise<number> {
    return this.instances.get(instancePath)?.size ?? 0;
  }

  async instanceMembers(instancePath: string): Promise<string[]> {
    return [...(this.instances.get(instancePath) ?? [])];
  }
}

export class RedisPresence implements Presence {
  private static readonly SESSIONS = 'playmesh:presence:sessions';

  constructor(private readonly redis: Redis) {}

  private instanceKey(instancePath: string): string {
    return `playmesh:presence:instance:${instancePath}`;
  }

  async sessionConnected(sessionId: string, userId: string): Promise<void> {
    await this.redis.hset(RedisPresence.SESSIONS, sessionId, userId);
  }

  async sessionDisconnected(sessionId: string): Promise<void> {
    await this.redis.hdel(RedisPresence.SESSIONS, sessionId);
  }

  async joined(instancePath: string, sessionId: string): Promise<void> {
    await this.redis.sadd(this.instanceKey(instancePath), sessionId);
  }

  async left(instancePath: string, sessionId: string): Promise<void> {
    await this.redis.srem(this.instanceKey(instancePath), sessionId);
  }

  async onlineCount(): Promise<number> {
    return this.redis.hlen(RedisPresence.SESSIONS);
  }

  async onlineUserIds(): Promise<string[]> {
    return [...new Set(Object.values(await this.redis.hgetall(RedisPresence.SESSIONS)))];
  }

  async instanceCount(instancePath: string): Promise<number> {
    return this.redis.scard(this.instanceKey(instancePath));
  }

  async instanceMembers(instancePath: string): Promise<string[]> {
    return this.redis.smembers(this.instanceKey(instancePath));
  }
}
