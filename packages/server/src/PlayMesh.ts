import { createServer, type Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis, type RedisOptions } from 'ioredis';
import { Domain } from './Domain.js';
import { Instance } from './Instance.js';
import { Session } from './Session.js';
import { QueueManager } from './queues.js';
import { MemoryPresence, RedisPresence, type Presence } from './presence.js';
import { MemoryStateStore, RedisStateStore, type StateStore } from './state.js';
import { PROTOCOL, RESERVED_PREFIX } from './protocol.js';
import type {
  AdmissionHook,
  AuthenticateHook,
  AuthResult,
  BootstrapHook,
  LifecycleHook,
  Metrics,
  Middleware,
  MiddlewareContext,
  Plugin,
  PlayMeshOptions,
  SessionHook
} from './types.js';

/**
 * The Universe: the root of a PlayMesh deployment.
 */
export class PlayMesh {
  private readonly options: PlayMeshOptions;
  private readonly domainsMap = new Map<string, Domain>();
  private readonly sessionsMap = new Map<string, Session>();

  private readonly bootstrapHooks: BootstrapHook[] = [];
  private readonly startedHooks: LifecycleHook[] = [];
  private readonly shutdownHooks: LifecycleHook[] = [];
  private readonly connectHooks: SessionHook[] = [];
  private readonly disconnectHooks: SessionHook[] = [];
  private readonly sessionCreateHooks: SessionHook[] = [];
  private readonly middlewares: Middleware[] = [];
  private readonly plugins: Plugin[] = [];

  private authenticateHook?: AuthenticateHook;
  private admissionHook?: AdmissionHook;

  private httpServer?: HttpServer;
  private ioServer?: SocketIOServer;
  private redisClient?: Redis;
  private redisSubClient?: Redis;
  private queueManager?: QueueManager;
  private startedAt?: number;
  private started = false;

  /** @internal */
  stateStore: StateStore = new MemoryStateStore();
  /** @internal */
  presence: Presence = new MemoryPresence();

  constructor(options: PlayMeshOptions = {}) {
    this.options = options;
  }

  /** The underlying Socket.IO server. Available after start(). */
  get io(): SocketIOServer {
    if (!this.ioServer) {
      throw new Error('PlayMesh has not been started yet. Call mesh.start() first.');
    }
    return this.ioServer;
  }

  /** The shared Redis client, when Redis is configured. */
  get redis(): Redis {
    if (!this.redisClient) {
      throw new Error('Redis is not configured for this PlayMesh server.');
    }
    return this.redisClient;
  }

  get domains(): Domain[] {
    return [...this.domainsMap.values()];
  }

  get sessions(): Session[] {
    return [...this.sessionsMap.values()];
  }

  // ── Topology ────────────────────────────────────────────────────────

  createDomain(id: string): Domain {
    if (this.domainsMap.has(id)) {
      throw new Error(`Domain "${id}" already exists`);
    }
    const domain = new Domain(this, id);
    this.domainsMap.set(id, domain);
    return domain;
  }

  domain(id: string): Domain {
    const domain = this.domainsMap.get(id);
    if (!domain) {
      throw new Error(`Domain "${id}" not found`);
    }
    return domain;
  }

  hasDomain(id: string): boolean {
    return this.domainsMap.has(id);
  }

  /**
   * Resolve an instance reference: a `domainId/instanceId` path, a bare
   * instance id (unique across all domains), or an Instance object.
   */
  resolveInstance(ref: string | Instance): Instance {
    if (ref instanceof Instance) return ref;
    if (ref.includes('/')) {
      const [domainId, instanceId] = ref.split('/', 2);
      return this.domain(domainId).instance(instanceId);
    }
    const matches: Instance[] = [];
    for (const domain of this.domainsMap.values()) {
      const instance = domain.findInstance(ref);
      if (instance) matches.push(instance);
    }
    if (matches.length === 0) {
      throw new Error(`Instance "${ref}" not found in any domain`);
    }
    if (matches.length > 1) {
      throw new Error(
        `Instance id "${ref}" is ambiguous (${matches.map(m => m.path).join(', ')}). ` +
          'Use the "domainId/instanceId" form.'
      );
    }
    return matches[0];
  }

  // ── Hooks ───────────────────────────────────────────────────────────

  bootstrap(hook: BootstrapHook): this {
    this.bootstrapHooks.push(hook);
    return this;
  }

  onAuthenticate(hook: AuthenticateHook): this {
    if (this.authenticateHook) {
      throw new Error('An authentication hook is already registered');
    }
    this.authenticateHook = hook;
    return this;
  }

  onAdmission(hook: AdmissionHook): this {
    if (this.admissionHook) {
      throw new Error('An admission hook is already registered');
    }
    this.admissionHook = hook;
    return this;
  }

  onStarted(hook: LifecycleHook): this {
    this.startedHooks.push(hook);
    return this;
  }

  onShutdown(hook: LifecycleHook): this {
    this.shutdownHooks.push(hook);
    return this;
  }

  onConnect(hook: SessionHook): this {
    this.connectHooks.push(hook);
    return this;
  }

  onDisconnect(hook: SessionHook): this {
    this.disconnectHooks.push(hook);
    return this;
  }

  onSessionCreate(hook: SessionHook): this {
    this.sessionCreateHooks.push(hook);
    return this;
  }

  /** Register a middleware function or install a plugin. */
  use(extension: Middleware | Plugin): this {
    if (typeof extension === 'function') {
      this.middlewares.push(extension);
    } else if (extension && typeof extension.install === 'function') {
      this.plugins.push(extension);
    } else {
      throw new Error('use() expects a middleware function or a plugin with an install() method');
    }
    return this;
  }

  // ── Messaging ───────────────────────────────────────────────────────

  /** Send an event to every connected session, across all nodes. */
  broadcast(event: string, payload?: unknown): void {
    this.io.emit(event, payload);
  }

  // ── Queues ──────────────────────────────────────────────────────────

  get queues(): QueueManager {
    if (!this.queueManager) {
      throw new Error('Queues require Redis. Configure the "redis" option to use queues.');
    }
    return this.queueManager;
  }

  // ── Monitoring ──────────────────────────────────────────────────────

  metrics(): Metrics {
    let instances = 0;
    for (const domain of this.domainsMap.values()) {
      instances += domain.instances.length;
    }
    return {
      sessions: this.sessionsMap.size,
      domains: this.domainsMap.size,
      instances,
      uptimeMs: this.startedAt ? Date.now() - this.startedAt : 0
    };
  }

  // ── Lifecycle ───────────────────────────────────────────────────────

  async start(): Promise<{ port: number }> {
    if (this.started) {
      throw new Error('PlayMesh is already started');
    }
    this.started = true;

    if (this.options.redis !== undefined) {
      this.redisClient = this.createRedisClient();
      this.redisSubClient = this.redisClient.duplicate();
      this.stateStore = new RedisStateStore(this.redisClient);
      this.presence = new RedisPresence(this.redisClient);
      this.queueManager = new QueueManager(this.redisConnectionOptions());
    }

    for (const plugin of this.plugins) {
      await plugin.install(this);
    }

    // The server does not accept connections until bootstrap completes.
    for (const hook of this.bootstrapHooks) {
      await hook({ mesh: this });
    }

    this.httpServer = this.options.server ?? createServer();
    this.ioServer = new SocketIOServer(this.httpServer, this.options.socket);

    if (this.redisClient && this.redisSubClient) {
      this.ioServer.adapter(createAdapter(this.redisClient, this.redisSubClient));
    }

    this.ioServer.use(async (socket, next) => {
      try {
        socket.data.auth = await this.authenticate(socket);
        next();
      } catch (error) {
        next(error instanceof Error ? error : new Error('Authentication failed'));
      }
    });

    this.ioServer.on('connection', socket => {
      void this.handleConnection(socket);
    });

    if (!this.httpServer.listening) {
      const port = this.options.port ?? 3000;
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.once('error', reject);
        this.httpServer!.listen(port, () => {
          this.httpServer!.removeListener('error', reject);
          resolve();
        });
      });
    }

    this.startedAt = Date.now();
    for (const hook of this.startedHooks) {
      await hook();
    }

    const address = this.httpServer.address();
    return { port: typeof address === 'object' && address ? address.port : (this.options.port ?? 3000) };
  }

  async shutdown(): Promise<void> {
    for (const hook of this.shutdownHooks) {
      await hook();
    }
    if (this.ioServer) {
      await this.ioServer.close();
      this.ioServer = undefined;
    }
    await this.queueManager?.close();
    this.queueManager = undefined;
    this.redisSubClient?.disconnect();
    this.redisClient?.disconnect();
    this.redisSubClient = undefined;
    this.redisClient = undefined;
    this.sessionsMap.clear();
    this.started = false;
    this.startedAt = undefined;
  }

  // ── Internals ───────────────────────────────────────────────────────

  private createRedisClient(): Redis {
    const redis = this.options.redis!;
    return typeof redis === 'string' ? new Redis(redis) : new Redis(redis);
  }

  private redisConnectionOptions(): RedisOptions {
    const redis = this.options.redis!;
    if (typeof redis === 'string') {
      const url = new URL(redis);
      return {
        host: url.hostname,
        port: url.port ? Number(url.port) : 6379,
        password: url.password || undefined,
        db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined
      };
    }
    return redis;
  }

  private async authenticate(socket: Socket): Promise<AuthResult> {
    const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;
    if (!this.authenticateHook) {
      // No auth hook: sessions are anonymous, keyed by socket id.
      return { userId: socket.id };
    }
    const result = await this.authenticateHook({
      token: typeof auth.token === 'string' ? auth.token : undefined,
      auth,
      headers: socket.handshake.headers,
      address: socket.handshake.address
    });
    if (!result || typeof result.userId !== 'string' || result.userId.length === 0) {
      throw new Error('Authentication failed');
    }
    return result;
  }

  private async handleConnection(socket: Socket): Promise<void> {
    const auth = socket.data.auth as AuthResult;
    const session = new Session(this, socket, auth.userId, auth.data ?? {});
    this.sessionsMap.set(session.id, session);

    socket.onAny((event: string, payload: unknown) => {
      void this.dispatch(session, event, payload);
    });

    socket.on('disconnect', () => {
      void this.handleDisconnect(session);
    });

    try {
      await this.presence.sessionConnected(session.id, session.userId);

      for (const hook of this.sessionCreateHooks) {
        await hook(session);
      }
      for (const hook of this.connectHooks) {
        await hook(session);
      }

      if (this.admissionHook) {
        const admission = await this.admissionHook({
          sessionId: session.id,
          userId: session.userId,
          data: session.data
        });
        for (const ref of admission?.instances ?? []) {
          await session.join(this.resolveInstance(ref));
        }
      }

      socket.emit(PROTOCOL.SESSION, {
        sessionId: session.id,
        userId: session.userId,
        instances: session.instances.map(instance => instance.path)
      });
    } catch (error) {
      socket.emit(PROTOCOL.ERROR, {
        scope: 'connection',
        message: error instanceof Error ? error.message : 'Connection setup failed'
      });
      socket.disconnect(true);
    }
  }

  private async handleDisconnect(session: Session): Promise<void> {
    this.sessionsMap.delete(session.id);
    await session._handleDisconnect();
    await this.presence.sessionDisconnected(session.id, session.userId);
    for (const hook of this.disconnectHooks) {
      await hook(session);
    }
  }

  private async dispatch(session: Session, event: string, payload: unknown): Promise<void> {
    if (event.startsWith(RESERVED_PREFIX)) return;
    const context: MiddlewareContext = { event, payload, session, mesh: this };
    try {
      await this.runMiddlewares(context, async () => {
        for (const instance of session.instances) {
          if (instance.hasHandler(event)) {
            await instance._handle(session, event, payload);
          }
        }
      });
    } catch (error) {
      session.send(PROTOCOL.ERROR, {
        scope: 'event',
        event,
        message: error instanceof Error ? error.message : 'Event handling failed'
      });
    }
  }

  private async runMiddlewares(
    context: MiddlewareContext,
    terminal: () => Promise<void>
  ): Promise<void> {
    const middlewares = this.middlewares;
    let lastIndex = -1;
    const run = async (index: number): Promise<void> => {
      if (index <= lastIndex) {
        throw new Error('next() called multiple times in middleware');
      }
      lastIndex = index;
      if (index < middlewares.length) {
        await middlewares[index](context, () => run(index + 1));
      } else {
        await terminal();
      }
    };
    await run(0);
  }
}
