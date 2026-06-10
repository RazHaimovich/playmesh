import { PROTOCOL, instanceRoom, domainRoom } from './protocol.js';
import type { Socket } from 'socket.io';
import type { Instance } from './Instance.js';
import type { PlayMesh } from './PlayMesh.js';

/**
 * A connected client. A session can be a member of multiple instances
 * simultaneously (world + guild + party + global chat...).
 */
export class Session {
  readonly id: string;
  readonly userId: string;
  /** Application data attached by the authentication hook. */
  data: Record<string, unknown>;

  /** @internal */
  readonly socket: Socket;
  private readonly mesh: PlayMesh;
  private readonly memberships = new Map<string, Instance>();

  constructor(mesh: PlayMesh, socket: Socket, userId: string, data: Record<string, unknown>) {
    this.mesh = mesh;
    this.socket = socket;
    this.id = socket.id;
    this.userId = userId;
    this.data = data;
  }

  /** Instances this session is currently a member of. */
  get instances(): Instance[] {
    return [...this.memberships.values()];
  }

  isIn(instance: Instance | string): boolean {
    if (typeof instance === 'string') {
      if (this.memberships.has(instance)) return true;
      return this.instances.some(member => member.id === instance);
    }
    return this.memberships.has(instance.path);
  }

  async join(instance: Instance): Promise<void> {
    if (this.memberships.has(instance.path)) return;
    this.memberships.set(instance.path, instance);
    instance._addSession(this);
    await this.socket.join([instanceRoom(instance.path), domainRoom(instance.domain.id)]);
    await this.mesh.presence.joined(instance.path, this.id);
    this.socket.emit(PROTOCOL.JOINED, { instance: instance.path });
    await instance._emitJoin(this);
  }

  async leave(instance: Instance): Promise<void> {
    if (!this.memberships.delete(instance.path)) return;
    instance._removeSession(this);
    await this.socket.leave(instanceRoom(instance.path));
    const stillInDomain = this.instances.some(member => member.domain === instance.domain);
    if (!stillInDomain) {
      await this.socket.leave(domainRoom(instance.domain.id));
    }
    await this.mesh.presence.left(instance.path, this.id);
    this.socket.emit(PROTOCOL.LEFT, { instance: instance.path });
    await instance._emitLeave(this);
  }

  /** Send an event to this client only. */
  send(event: string, payload?: unknown): void {
    this.socket.emit(event, payload);
  }

  /** Forcibly disconnect this client. */
  disconnect(): void {
    this.socket.disconnect(true);
  }

  /** @internal Clean up memberships when the underlying socket drops. */
  async _handleDisconnect(): Promise<void> {
    for (const instance of this.instances) {
      this.memberships.delete(instance.path);
      instance._removeSession(this);
      await this.mesh.presence.left(instance.path, this.id);
      await instance._emitLeave(this);
    }
  }
}
