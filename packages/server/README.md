# @playmesh/server

PlayMesh multiplayer server framework — Socket.IO, Redis and BullMQ infrastructure for multiplayer worlds.

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
npm install @playmesh/server socket.io ioredis bullmq
```

## Quick Start

```ts
import { PlayMesh } from '@playmesh/server';

// Create a PlayMesh instance
const mesh = new PlayMesh({
  io: socketIOInstance,
  // Optional: configure Redis for multi-node deployments
  redis: {
    host: 'localhost',
    port: 6379
  }
});

// Define a domain
const gameDomain = await mesh.domain('game');

// Create an instance (e.g., a game world)
const instance = await gameDomain.instance('world-1');

// Handle player connections
instance.on('player:join', (session) => {
  console.log(`Player ${session.id} joined`);
});

instance.on('player:leave', (session) => {
  console.log(`Player ${session.id} left`);
});
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
const domain = await mesh.domain('lobby');
```

### Instance

A specific multiplayer environment within a domain (e.g., a specific game world, match, or chat room).

```ts
const instance = await domain.instance('world-1');
```

### Session

An authenticated user connection with lifecycle management.

```ts
instance.on('player:join', (session) => {
  // Access session properties
  console.log(session.id, session.userId, session.metadata);
});
```

## Configuration

### Single-Node (Development)

For development without Redis, PlayMesh runs in single-node mode with in-memory state:

```ts
const mesh = new PlayMesh({ io: socketIO });
```

### Multi-Node (Production)

Configure Redis for multi-node deployments:

```ts
const mesh = new PlayMesh({
  io: socketIO,
  redis: {
    host: 'localhost',
    port: 6379,
    password: process.env.REDIS_PASSWORD
  }
});
```

## API Reference

### PlayMesh

- `domain(name: string)` — Access or create a domain
- `instance(domainName: string, instanceName: string)` — Access or create an instance
- `message(target, event, data)` — Send targeted messages

### Domain

- `instance(name: string)` — Access or create an instance within the domain
- `broadcast(event, data)` — Broadcast to all instances in the domain

### Instance

- `broadcast(event, data)` — Broadcast to all sessions in the instance
- `message(sessionId, event, data)` — Send to a specific session
- `presence()` — Get current presence information

### Session

- `id` — Unique session identifier
- `userId` — Associated user ID (from authentication)
- `metadata` — Custom session metadata
- `send(event, data)` — Send event to this session

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
