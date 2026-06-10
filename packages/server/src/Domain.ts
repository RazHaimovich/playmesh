import { Instance } from './Instance.js';
import { domainRoom } from './protocol.js';
import type { PlayMesh } from './PlayMesh.js';
import type { InstanceHook } from './types.js';

/**
 * A logical grouping of related instances (a world, a lobby, ranked...).
 */
export class Domain {
  readonly id: string;
  /** @internal */
  readonly mesh: PlayMesh;

  private readonly instancesMap = new Map<string, Instance>();
  private readonly createdHooks: InstanceHook[] = [];
  private readonly destroyedHooks: InstanceHook[] = [];

  constructor(mesh: PlayMesh, id: string) {
    this.mesh = mesh;
    this.id = id;
  }

  get instances(): Instance[] {
    return [...this.instancesMap.values()];
  }

  createInstance(id: string): Instance {
    if (this.instancesMap.has(id)) {
      throw new Error(`Instance "${id}" already exists in domain "${this.id}"`);
    }
    const instance = new Instance(this, id);
    this.instancesMap.set(id, instance);
    for (const hook of this.createdHooks) {
      void hook(instance);
    }
    return instance;
  }

  instance(id: string): Instance {
    const instance = this.instancesMap.get(id);
    if (!instance) {
      throw new Error(`Instance "${id}" not found in domain "${this.id}"`);
    }
    return instance;
  }

  hasInstance(id: string): boolean {
    return this.instancesMap.has(id);
  }

  /** @internal */
  findInstance(id: string): Instance | undefined {
    return this.instancesMap.get(id);
  }

  async destroyInstance(id: string): Promise<void> {
    const instance = this.instancesMap.get(id);
    if (!instance) return;
    for (const session of instance.sessions) {
      await session.leave(instance);
    }
    await instance.state.clear();
    this.instancesMap.delete(id);
    for (const hook of this.destroyedHooks) {
      await hook(instance);
    }
  }

  /** Send an event to every session in any instance of this domain. */
  broadcast(event: string, payload?: unknown): void {
    this.mesh.io.to(domainRoom(this.id)).emit(event, payload);
  }

  onInstanceCreated(hook: InstanceHook): this {
    this.createdHooks.push(hook);
    return this;
  }

  onInstanceDestroyed(hook: InstanceHook): this {
    this.destroyedHooks.push(hook);
    return this;
  }
}
