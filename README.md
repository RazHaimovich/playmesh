# PlayMesh

> Build multiplayer worlds, not networking infrastructure.

PlayMesh is an open-source multiplayer server framework for Node.js built on top of Socket.IO, Redis, and BullMQ.

It provides the infrastructure required to build scalable multiplayer games, virtual worlds, social experiences, and real-time collaborative applications.

PlayMesh focuses on networking, distributed communication, session management, presence tracking, and horizontal scaling while leaving business logic and persistence entirely to the application developer.

---

# Repository

This is a monorepo managed with npm workspaces.

```text
packages/
 ├── server   @playmesh/server — the server framework
 └── client   @playmesh/client — the client SDK
examples/
 └── chat     Minimal chat server + client
```

```bash
npm install        # install all workspace dependencies
npm run build      # build both packages
npm test           # run the integration test suite
npm run typecheck  # typecheck both packages
```

The examples are plain scripts that resolve the workspace packages directly — build first, then:

```bash
npm run example:chat:server          # start the chat server (PORT=4000 by default)
npm run example:chat:client -- raz   # connect a client as "raz"
```

Redis is optional in development: when the `redis` option is omitted, PlayMesh runs in single-node mode with in-memory state and presence. Configure Redis for multi-node deployments and queues.

---

# Packages

## Server SDK

```bash
npm install @playmesh/server
```

`socket.io`, `ioredis`, and `bullmq` are bundled as dependencies — no need to install them separately.

Used to build multiplayer servers: Socket.IO integration, session management, authentication hooks, domain and instance management, presence tracking, distributed communication, Redis synchronization, background queues, and horizontal scaling.

## Client SDK

```bash
npm install @playmesh/client
```

Used by games and applications to communicate with PlayMesh servers: connection management, reconnection handling, event communication, session lifecycle, instance membership, and server messaging.

```ts
import { PlayMeshClient } from '@playmesh/client';

const client = new PlayMeshClient({
  url: 'wss://game.example.com'
});

await client.connect();
```

---

# Core Philosophy

PlayMesh is infrastructure. It is not a game engine, a database, an ORM, a backend-as-a-service, or a persistence framework.

The framework provides real-time networking, session management, presence, distributed messaging, instance management, queue processing, and horizontal scaling.

The application provides authentication logic, databases, game logic, economy systems, inventory systems, analytics, persistence, and business rules.

---

# Architecture

PlayMesh organizes multiplayer environments using a hierarchical model.

```text
Universe
 ├── Domain
 │    ├── Instance
 │    ├── Instance
 │    └── Instance
 └── Domain
```

## Universe

The root PlayMesh deployment, representing the entire server cluster.

```ts
const mesh = new PlayMesh();
```

## Domain

A logical grouping of related multiplayer experiences (world, lobby, marketplace, ranked, social).

```ts
const world = mesh.createDomain('world');
```

## Instance

An isolated multiplayer environment (dungeon, match, city, chat room, guild hall, trade hub).

```ts
const city = world.createInstance('city-center');
```

## Session

Represents a connected client.

```ts
session.id;
session.userId;
session.data;
```

Sessions are synchronized across all running server nodes.

---

# Multi-Instance Membership

A Session can belong to multiple Instances simultaneously.

```ts
await session.join(worldInstance);
await session.join(guildInstance);
await session.join(tradeChatInstance);
```

The player is now participating in all three instances — modern multiplayer systems often require users to participate in multiple communication groups at once (world, guild, party, global chat).

## Session API

```ts
await session.join(instance);   // join
await session.leave(instance);  // leave
session.isIn(instance);         // check membership
session.instances;              // list memberships
```

---

# Server Bootstrap

Before the server begins accepting connections, PlayMesh allows applications to initialize their environment.

```ts
mesh.bootstrap(async ({ mesh }) => {
  const worlds = await db.worlds.find();

  for (const world of worlds) {
    const domain = mesh.createDomain(world.id);

    for (const area of world.instances) {
      domain.createInstance(area.id);
    }
  }
});
```

The server will not begin accepting client connections until bootstrap completes successfully.

Typical bootstrap tasks: load domains, create instances, warm caches, connect external services, initialize matchmaking queues, register scheduled jobs.

---

# Authentication

PlayMesh does not implement authentication. Applications decide how users authenticate.

```ts
mesh.onAuthenticate(async request => {
  const user = await authService.verifyToken(request.token);

  return {
    userId: user.id,
    data: user
  };
});
```

Supported approaches: JWT, OAuth, custom login servers, API keys, third-party identity providers.

---

# Admission Flow

After authentication, the application decides where the user should be placed.

```ts
mesh.onAdmission(async request => {
  const player = await db.players.findById(request.userId);

  return {
    instances: [
      'world-city',
      'guild-dragon-slayers'
    ]
  };
});
```

The framework then automatically joins the session to those instances.

## Manual Assignment

```ts
mesh.onSessionCreate(async session => {
  const city = mesh.domain('world').instance('city');

  await session.join(city);
});
```

---

# Communication

PlayMesh uses an event-driven communication model.

## Client To Server

```ts
// client
client.emit('move', { x: 100, y: 200 });

// server
instance.on('move', (session, payload) => {
  // handle movement
});
```

## Server To Client

```ts
session.send('inventory-update', { items });
```

## Instance Broadcast

```ts
instance.broadcast('chat-message', {
  sender: session.userId,
  message: 'Hello'
});
```

## Domain Broadcast

```ts
domain.broadcast('announcement', {
  text: 'Maintenance in 10 minutes'
});
```

## Global Broadcast

```ts
mesh.broadcast('maintenance');
```

---

# Lifecycle Events

## Server Lifecycle

```ts
mesh.bootstrap(async () => {});
mesh.onStarted(() => {});
mesh.onShutdown(() => {});
```

## Session Lifecycle

```ts
mesh.onConnect(session => {});
mesh.onDisconnect(session => {});
mesh.onSessionCreate(session => {});
```

## Instance Lifecycle

```ts
instance.onJoin(session => {});
instance.onLeave(session => {});
```

## Domain Lifecycle

```ts
domain.onInstanceCreated(instance => {});
domain.onInstanceDestroyed(instance => {});
```

---

# Data Persistence

PlayMesh does not store application data and intentionally avoids coupling applications to a specific database technology.

The framework does not provide user storage, character storage, inventory storage, economy storage, quest storage, save systems, ORM integrations, or database abstractions. Applications are responsible for persistence (PostgreSQL, MySQL, MongoDB, DynamoDB, Elasticsearch, custom storage systems).

```ts
instance.on('buy-item', async (session, payload) => {
  const user = await db.users.findById(session.userId);
  const item = await db.items.findById(payload.itemId);

  if (user.gold < item.price) {
    return;
  }

  await db.users.updateGold(user.id, user.gold - item.price);

  session.send('purchase-success');
});
```

PlayMesh never automatically persists business data.

---

# Redis Usage

Redis is an infrastructure dependency, not the application's primary database.

- **Presence** — online users, session tracking, active domains, active instances
- **Cache** — runtime metadata, temporary state, shared runtime values, rate limiting, distributed locks
- **Pub/Sub** — cross-node communication, event propagation, broadcast synchronization
- **Queues** — powered by BullMQ: matchmaking, delayed tasks, background processing, event pipelines

---

# Runtime State

PlayMesh provides synchronized runtime state storage.

```ts
instance.state.set('boss-health', 1500);

const health = await instance.state.get('boss-health');
```

Suitable for match timers, boss health, active objectives, runtime counters, and temporary shared state. Not suitable for permanent persistence.

---

# Middleware

PlayMesh supports middleware pipelines.

```ts
mesh.use(async (context, next) => {
  console.log(context.event);

  await next();
});
```

Common use cases: validation, logging, rate limiting, analytics, permissions, anti-cheat.

---

# Plugins

PlayMesh supports custom extensions.

```ts
mesh.use(new MatchmakingPlugin());
```

Potential plugins: matchmaking, leaderboards, metrics, analytics, moderation, anti-cheat.

---

# Horizontal Scaling

PlayMesh is designed for distributed environments.

```text
                  Redis
                     |
      --------------------------------
      |              |              |
   Node 1         Node 2         Node 3
      |              |              |
 Socket.IO      Socket.IO      Socket.IO
```

Features: multi-node support, stateless application nodes, distributed communication, automatic synchronization.

Deployment targets: Docker, Kubernetes, AWS ECS, AWS EKS, Fly.io, Railway, DigitalOcean.

---

# Monitoring

Built-in metrics include connected sessions, active domains, active instances, queue throughput, events per second, Redis latency, and node health.

```ts
mesh.metrics();
// { sessions, domains, instances, uptimeMs }
```

---

# Quick Start

## Installation

```bash
npm install @playmesh/server
npm install @playmesh/client
```

## Create Server

Redis is optional. Omit it for local development (in-memory state and presence); add it for multi-node production deployments.

```ts
import { PlayMesh } from '@playmesh/server';

// No Redis — single-node mode, in-memory state and presence
const mesh = new PlayMesh();

// With Redis — distributed mode, required for multi-node deployments
// const mesh = new PlayMesh({ redis: { host: 'localhost', port: 6379 } });

const world = mesh.createDomain('world');
const city = world.createInstance('city-center');

city.on('chat', (session, payload) => {
  city.broadcast('chat', {
    sender: session.userId,
    message: payload.message
  });
});

await mesh.start();
```

---

# Responsibility Matrix

| Feature | PlayMesh | Application |
|----------|----------|----------|
| Socket Communication | ✅ | |
| Session Management | ✅ | |
| Presence Tracking | ✅ | |
| Distributed Messaging | ✅ | |
| Multi-Node Support | ✅ | |
| Redis Infrastructure | ✅ | |
| Queue Infrastructure | ✅ | |
| Authentication Logic | | ✅ |
| Databases | | ✅ |
| Game Logic | | ✅ |
| Economy | | ✅ |
| Inventory | | ✅ |
| Analytics | | ✅ |
| Persistence | | ✅ |

---

# Vision

PlayMesh aims to become the standard multiplayer networking framework for the JavaScript ecosystem.

It combines Socket.IO networking, Redis scalability, BullMQ processing, TypeScript-first APIs, and flexible multiplayer architecture.

Developers build the experience. PlayMesh provides the foundation.

---

# License

MIT
