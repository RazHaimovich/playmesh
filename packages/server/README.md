# @playmesh/server

PlayMesh multiplayer server framework — Socket.IO, Redis and BullMQ infrastructure for multiplayer worlds.

[![npm](https://img.shields.io/npm/v/@playmesh/server)](https://www.npmjs.com/package/@playmesh/server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**[Website](https://playmesh.dev)** · **[GitHub](https://github.com/RazHaimovich/playmesh)** · **[npm](https://www.npmjs.com/package/@playmesh/server)**

## Overview

`@playmesh/server` is the core server framework for building scalable multiplayer games, virtual worlds, social experiences, and real-time collaborative applications. It provides:

- **Socket.IO Integration** — WebSocket communication with automatic reconnection handling
- **Session Management** — User sessions, authentication hooks, and lifecycle management
- **Distributed Architecture** — Multi-node deployments with Redis synchronization
- **Presence Tracking** — Real-time user presence across domains and instances
- **Domain & Instance Management** — Hierarchical organization of multiplayer environments
- **Message Distribution** — Targeted messaging, broadcasts, and server-to-client communication
- **Background Queues** — Job processing with BullMQ for async operations
- **Horizontal Scaling** — Built-in support for multi-node deployments

## Installation

```bash
npm install @playmesh/server
```

`socket.io`, `ioredis`, and `bullmq` are bundled as dependencies — no need to install them separately.

## Quick Start

```ts
import { PlayMesh } from '@playmesh/server';

const mesh = new PlayMesh();

const world = mesh.createDomain('world');
const city = world.createInstance('city-center');

city.onJoin(session => {
  console.log(`Player ${session.userId} joined`);
});

city.onLeave(session => {
  console.log(`Player ${session.userId} left`);
});

city.on('chat', (session, payload) => {
  city.broadcast('chat', { sender: session.userId, message: payload });
});

await mesh.start();
```

## Core Concepts

### Universe

The root PlayMesh deployment representing your entire server cluster.

```ts
const mesh = new PlayMesh();
```

### Domain

A logical grouping of related multiplayer experiences (e.g., lobby, ranked, open-world, marketplace).

```ts
const domain = mesh.createDomain('lobby');
```

### Instance

A specific multiplayer environment within a domain (e.g., a game world, match, or chat room).

```ts
const instance = domain.createInstance('world-1');
```

### Session

An authenticated user connection with lifecycle management.

```ts
instance.onJoin(session => {
  console.log(session.id, session.userId, session.data);
});
```

## Configuration

### Single-Node (Development)

Redis is optional. Omit it to run in single-node mode with in-memory state and presence:

```ts
const mesh = new PlayMesh();
```

### Multi-Node (Production)

Configure Redis for multi-node deployments:

```ts
const mesh = new PlayMesh({
  redis: {
    host: 'localhost',
    port: 6379,
    password: process.env.REDIS_PASSWORD
  }
});
```

Redis can also be passed as a connection URL string:

```ts
const mesh = new PlayMesh({ redis: process.env.REDIS_URL });
```

### Port

```ts
const mesh = new PlayMesh({ port: 4000 });
```

## API Reference

### PlayMesh

**Constructor options** (`PlayMeshOptions`):

| Option | Type | Description |
|--------|------|-------------|
| `port` | `number` | Port to listen on. Defaults to `3000`. |
| `server` | `HttpServer` | Optional pre-created HTTP server to attach to. |
| `redis` | `RedisOptions \| string` | Redis connection. Omit for single-node in-memory mode. |
| `socket` | `Partial<ServerOptions>` | Options forwarded to the underlying Socket.IO server. |

**Topology:**

- `createDomain(id: string): Domain` — Create a new domain
- `domain(id: string): Domain` — Access an existing domain (throws if not found)
- `hasDomain(id: string): boolean` — Check if a domain exists
- `resolveInstance(ref: string | Instance): Instance` — Resolve a `domainId/instanceId` path or bare instance id

**Hooks:**

- `bootstrap(hook)` — Run async setup before the server accepts connections
- `onAuthenticate(hook)` — Validate client credentials; return `{ userId, data? }`
- `onAdmission(hook)` — Decide which instances a session joins on connect; return `{ instances }`
- `onSessionCreate(hook)` — Called when a session is created
- `onConnect(hook)` — Called after a session fully connects
- `onDisconnect(hook)` — Called when a session disconnects
- `onStarted(hook)` — Called after the server starts
- `onShutdown(hook)` — Called during graceful shutdown

**Messaging:**

- `broadcast(event, payload?)` — Send an event to every connected session across all nodes

**Other:**

- `use(extension)` — Register a middleware function or install a plugin
- `metrics(): Metrics` — Returns `{ sessions, domains, instances, uptimeMs }`
- `start(): Promise<{ port: number }>` — Start the server
- `shutdown(): Promise<void>` — Gracefully shut down
- `io` — The underlying Socket.IO server (available after `start()`)
- `redis` — The shared Redis client (throws if Redis is not configured)
- `queues` — BullMQ queue manager (throws if Redis is not configured)

### Domain

- `createInstance(id: string): Instance` — Create a new instance
- `instance(id: string): Instance` — Access an existing instance (throws if not found)
- `hasInstance(id: string): boolean` — Check if an instance exists
- `destroyInstance(id: string): Promise<void>` — Destroy an instance and evict all sessions
- `broadcast(event, payload?)` — Broadcast to all sessions in any instance of this domain
- `onInstanceCreated(hook)` — Called when an instance is created
- `onInstanceDestroyed(hook)` — Called when an instance is destroyed

### Instance

- `on(event, handler)` — Handle an event sent by clients in this instance; `handler(session, payload)`
- `off(event, handler)` — Remove a handler
- `onJoin(hook)` — Called when a session joins this instance
- `onLeave(hook)` — Called when a session leaves this instance
- `broadcast(event, payload?)` — Send an event to all sessions in this instance across all nodes
- `memberCount(): Promise<number>` — Number of member sessions across all nodes (presence-backed)
- `path` — Globally unique reference in `domainId/instanceId` form
- `sessions` — Sessions on this node that are members of this instance
- `state` — Synchronized runtime state scoped to this instance

### Session

- `id` — Unique session identifier (socket id)
- `userId` — User ID returned by the authentication hook
- `data` — Custom data attached by the authentication hook
- `instances` — Instances this session is currently a member of
- `join(instance): Promise<void>` — Join an instance
- `leave(instance): Promise<void>` — Leave an instance
- `isIn(instance): boolean` — Check if the session is a member of an instance
- `send(event, payload?)` — Send an event to this client only
- `disconnect()` — Forcibly disconnect this client

## Building

```bash
npm run build      # Build with tsup
npm run typecheck  # Type check with TypeScript
npm test          # Run tests with vitest
```

## Philosophy

PlayMesh is infrastructure, not a game engine or persistence layer. It focuses on:

- Real-time networking
- Session management
- Presence tracking
- Distributed messaging
- Horizontal scaling

Your application provides:

- Authentication logic
- Database persistence
- Game logic
- Business rules

## License

MIT
