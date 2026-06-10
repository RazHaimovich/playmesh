import { instanceRoom } from './protocol.js';
import { ScopedState } from './state.js';
import type { Domain } from './Domain.js';
import type { Session } from './Session.js';
import type { EventHandler, InstanceSessionHook } from './types.js';

/**
 * An isolated multiplayer environment (a match, a room, a city...).
 * Sessions join instances to receive their broadcasts and to have
 * their events routed to the instance's handlers.
 */
export class Instance {
  readonly id: string;
  readonly domain: Domain;
  /** Synchronized runtime state scoped to this instance. */
  readonly state: ScopedState;

  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly joinHooks: InstanceSessionHook[] = [];
  private readonly leaveHooks: InstanceSessionHook[] = [];
  /** Sessions connected to this node that are members of this instance. */
  private readonly localSessions = new Set<Session>();

  constructor(domain: Domain, id: string) {
    this.domain = domain;
    this.id = id;
    this.state = new ScopedState(() => domain.mesh.stateStore, this.path);
  }

  /** Globally unique reference: `domainId/instanceId`. */
  get path(): string {
    return `${this.domain.id}/${this.id}`;
  }

  /** Sessions on this node that are members of this instance. */
  get sessions(): Session[] {
    return [...this.localSessions];
  }

  on(event: string, handler: EventHandler): this {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return this;
  }

  off(event: string, handler: EventHandler): this {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  hasHandler(event: string): boolean {
    return (this.handlers.get(event)?.size ?? 0) > 0;
  }

  onJoin(hook: InstanceSessionHook): this {
    this.joinHooks.push(hook);
    return this;
  }

  onLeave(hook: InstanceSessionHook): this {
    this.leaveHooks.push(hook);
    return this;
  }

  /** Send an event to every session in this instance, across all nodes. */
  broadcast(event: string, payload?: unknown): void {
    this.domain.mesh.io.to(instanceRoom(this.path)).emit(event, payload);
  }

  /** Number of member sessions across all nodes (presence-backed). */
  memberCount(): Promise<number> {
    return this.domain.mesh.presence.instanceCount(this.path);
  }

  /** @internal */
  async _handle(session: Session, event: string, payload: unknown): Promise<void> {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      await handler(session, payload);
    }
  }

  /** @internal */
  _addSession(session: Session): void {
    this.localSessions.add(session);
  }

  /** @internal */
  _removeSession(session: Session): void {
    this.localSessions.delete(session);
  }

  /** @internal */
  async _emitJoin(session: Session): Promise<void> {
    for (const hook of this.joinHooks) {
      await hook(session);
    }
  }

  /** @internal */
  async _emitLeave(session: Session): Promise<void> {
    for (const hook of this.leaveHooks) {
      await hook(session);
    }
  }
}
