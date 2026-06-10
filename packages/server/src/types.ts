import type { RedisOptions } from 'ioredis';
import type { Server as HttpServer } from 'node:http';
import type { ServerOptions } from 'socket.io';
import type { Session } from './Session.js';
import type { Instance } from './Instance.js';
import type { Domain } from './Domain.js';
import type { PlayMesh } from './PlayMesh.js';

export interface PlayMeshOptions {
  /** Port to listen on. Defaults to 3000. Use 0 for an ephemeral port. */
  port?: number;
  /** Optional pre-created HTTP server to attach to. */
  server?: HttpServer;
  /**
   * Redis connection. When omitted, PlayMesh runs in single-node mode
   * with in-memory state, presence and no queues.
   */
  redis?: RedisOptions | string;
  /** Options forwarded to the underlying Socket.IO server. */
  socket?: Partial<ServerOptions>;
}

export interface AuthRequest {
  /** Convenience accessor for `auth.token` sent by the client. */
  token?: string;
  /** The full auth payload sent by the client. */
  auth: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
  address: string;
}

export interface AuthResult {
  userId: string;
  data?: Record<string, unknown>;
}

export type AuthenticateHook = (request: AuthRequest) => AuthResult | Promise<AuthResult>;

export interface AdmissionRequest {
  sessionId: string;
  userId: string;
  data: Record<string, unknown>;
}

export interface AdmissionResult {
  /**
   * Instance references to join. Either `domainId/instanceId` paths or
   * bare instance ids (resolved across all domains, must be unique).
   */
  instances: string[];
}

export type AdmissionHook = (request: AdmissionRequest) => AdmissionResult | Promise<AdmissionResult>;

export interface BootstrapContext {
  mesh: PlayMesh;
}

export type BootstrapHook = (context: BootstrapContext) => void | Promise<void>;

export type SessionHook = (session: Session) => void | Promise<void>;
export type InstanceSessionHook = (session: Session) => void | Promise<void>;
export type InstanceHook = (instance: Instance) => void | Promise<void>;
export type LifecycleHook = () => void | Promise<void>;

export type EventHandler = (session: Session, payload: unknown) => void | Promise<void>;

export interface MiddlewareContext {
  event: string;
  payload: unknown;
  session: Session;
  mesh: PlayMesh;
}

export type Middleware = (
  context: MiddlewareContext,
  next: () => Promise<void>
) => void | Promise<void>;

export interface Plugin {
  name?: string;
  install(mesh: PlayMesh): void | Promise<void>;
}

export interface Metrics {
  sessions: number;
  domains: number;
  instances: number;
  uptimeMs: number;
}

export type { Session, Instance, Domain };
