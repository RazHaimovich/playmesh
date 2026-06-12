import { io, type Socket, type SocketOptions, type ManagerOptions } from 'socket.io-client';

/** Reserved wire-protocol events. Mirrors the server SDK. */
const PROTOCOL = {
  SESSION: 'playmesh:session',
  JOINED: 'playmesh:joined',
  LEFT: 'playmesh:left',
  ERROR: 'playmesh:error'
} as const;

export interface SessionInfo {
  id: string;
  userId: string;
  /** Instance paths (`domainId/instanceId`) this session is a member of. */
  instances: string[];
}

export interface ServerError {
  scope: 'connection' | 'event';
  event?: string;
  message: string;
}

export interface PlayMeshClientOptions {
  /** Server URL, e.g. `https://game.example.com` or `http://localhost:3000`. */
  url: string;
  /**
   * Auth payload passed to the server's authentication hook, or a
   * function producing it (called on every connection attempt, useful
   * for refreshing tokens).
   */
  auth?: Record<string, unknown> | (() => Record<string, unknown> | Promise<Record<string, unknown>>);
  /** Options forwarded to the underlying Socket.IO client. */
  socket?: Partial<ManagerOptions & SocketOptions>;
}

type Handler = (payload: unknown) => void;

export class PlayMeshClient {
  private readonly options: PlayMeshClientOptions;
  private socket?: Socket;
  private sessionInfo?: SessionInfo;
  private readonly listeners = new Map<string, Set<Handler>>();
  private readonly disconnectHandlers = new Set<(reason: string) => void>();
  private readonly reconnectHandlers = new Set<() => void>();
  private readonly errorHandlers = new Set<(error: ServerError) => void>();

  constructor(options: PlayMeshClientOptions) {
    this.options = options;
  }

  /** Session details, available once connect() resolves. */
  get session(): SessionInfo | undefined {
    return this.sessionInfo;
  }

  /** Instance paths this session is currently a member of. */
  get instances(): string[] {
    return this.sessionInfo?.instances ?? [];
  }

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Connect and authenticate. Resolves once the server has established
   * the session (after authentication and admission).
   */
  async connect(): Promise<SessionInfo> {
    if (this.socket) {
      throw new Error('Client is already connected or connecting');
    }

    const { auth } = this.options;
    const authOption =
      typeof auth === 'function'
        ? (cb: (data: object) => void) => {
            void Promise.resolve(auth()).then(cb);
          }
        : auth;

    const socket = io(this.options.url, {
      ...this.options.socket,
      auth: authOption
    });
    this.socket = socket;
    this.bindProtocolListeners(socket);

    return new Promise<SessionInfo>((resolve, reject) => {
      const onSession = (info: { sessionId: string; userId: string; instances: string[] }) => {
        socket.off('connect_error', onConnectError);
        resolve({ id: info.sessionId, userId: info.userId, instances: info.instances });
      };
      const onConnectError = (error: Error) => {
        socket.off(PROTOCOL.SESSION, onSession);
        socket.disconnect();
        this.socket = undefined;
        reject(new Error(`Connection failed: ${error.message}`));
      };
      socket.once(PROTOCOL.SESSION, onSession);
      socket.once('connect_error', onConnectError);
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = undefined;
    this.sessionInfo = undefined;
  }

  /** Send an event to the server. */
  emit(event: string, payload?: unknown): void {
    if (!this.socket) {
      throw new Error('Client is not connected');
    }
    this.socket.emit(event, payload);
  }

  /** Listen for an event from the server. */
  on(event: string, handler: Handler): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return this;
  }

  off(event: string, handler: Handler): this {
    this.listeners.get(event)?.delete(handler);
    return this;
  }

  /** Called when the connection drops. */
  onDisconnect(handler: (reason: string) => void): this {
    this.disconnectHandlers.add(handler);
    return this;
  }

  /** Called when the connection is automatically re-established. */
  onReconnect(handler: () => void): this {
    this.reconnectHandlers.add(handler);
    return this;
  }

  /** Called when the server reports an error for this session. */
  onError(handler: (error: ServerError) => void): this {
    this.errorHandlers.add(handler);
    return this;
  }

  private bindProtocolListeners(socket: Socket): void {
    socket.on(PROTOCOL.SESSION, (info: { sessionId: string; userId: string; instances: string[] }) => {
      this.sessionInfo = { id: info.sessionId, userId: info.userId, instances: info.instances };
    });

    socket.on(PROTOCOL.JOINED, (data: { instance: string }) => {
      if (this.sessionInfo && !this.sessionInfo.instances.includes(data.instance)) {
        this.sessionInfo.instances.push(data.instance);
      }
    });

    socket.on(PROTOCOL.LEFT, (data: { instance: string }) => {
      if (this.sessionInfo) {
        this.sessionInfo.instances = this.sessionInfo.instances.filter(
          path => path !== data.instance
        );
      }
    });

    socket.on(PROTOCOL.ERROR, (error: ServerError) => {
      for (const handler of this.errorHandlers) handler(error);
    });

    socket.on('disconnect', (reason: string) => {
      for (const handler of this.disconnectHandlers) handler(reason);
    });

    socket.io.on('reconnect', () => {
      for (const handler of this.reconnectHandlers) handler();
    });

    socket.onAny((event: string, payload: unknown) => {
      if (event.startsWith('playmesh:')) return;
      const handlers = this.listeners.get(event);
      if (handlers) {
        for (const handler of handlers) handler(payload);
      }
    });
  }
}
