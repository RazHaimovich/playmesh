# @playmesh/client

PlayMesh client SDK — connect games and applications to PlayMesh servers.

## Overview

`@playmesh/client` is the client-side SDK for communicating with PlayMesh servers. It provides:

- **Connection Management** — Reliable WebSocket connections with automatic reconnection
- **Event Communication** — Send and receive events from the server
- **Session Lifecycle** — Track session info and instance membership
- **Server Messaging** — Listen for targeted and broadcast messages
- **Type-Safe APIs** — Full TypeScript support for client-server communication

## Installation

```bash
npm install @playmesh/client
```

## Quick Start

```ts
import { PlayMeshClient } from '@playmesh/client';

const client = new PlayMeshClient({
  url: 'wss://game.example.com',
  auth: { token: 'user-jwt-token' }
});

const session = await client.connect();
console.log(session.userId, session.instances);

// Send events to the server
client.emit('player:move', { x: 100, y: 200 });

// Receive events from the server
client.on('player:update', (data) => {
  console.log('Player update:', data);
});

client.onDisconnect((reason) => {
  console.log('Disconnected:', reason);
});

client.onReconnect(() => {
  console.log('Reconnected');
});
```

## Configuration

### Basic Connection

```ts
const client = new PlayMeshClient({
  url: 'wss://game.example.com'
});
```

### With Authentication

```ts
const client = new PlayMeshClient({
  url: 'wss://game.example.com',
  auth: {
    token: 'jwt-token-or-session-id',
    userId: 'player1'
  }
});
```

### Dynamic Auth (Token Refresh)

Pass a function to re-evaluate auth on every connection attempt:

```ts
const client = new PlayMeshClient({
  url: 'wss://game.example.com',
  auth: async () => ({ token: await authService.getToken() })
});
```

### Socket.IO Options

Reconnection and other Socket.IO options are passed under `socket`:

```ts
const client = new PlayMeshClient({
  url: 'wss://game.example.com',
  socket: {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity
  }
});
```

## API Reference

### PlayMeshClient

**Constructor options** (`PlayMeshClientOptions`):

| Option | Type | Description |
|--------|------|-------------|
| `url` | `string` | Server URL, e.g. `wss://game.example.com` or `http://localhost:3000` |
| `auth` | `Record<string, unknown> \| () => Record<string, unknown>` | Auth payload sent to the server's authentication hook |
| `socket` | `Partial<ManagerOptions & SocketOptions>` | Options forwarded to the underlying Socket.IO client |

**Methods:**

- `connect(): Promise<SessionInfo>` — Connect and authenticate. Resolves once the server has established the session.
- `disconnect(): void` — Disconnect from the server
- `emit(event: string, payload?: unknown): void` — Send an event to the server
- `on(event: string, handler: Function): this` — Listen for an event from the server
- `off(event: string, handler: Function): this` — Remove a listener
- `onDisconnect(handler: (reason: string) => void): this` — Called when the connection drops
- `onReconnect(handler: () => void): this` — Called when the connection is automatically re-established
- `onError(handler: (error: ServerError) => void): this` — Called when the server reports a session error

**Getters:**

- `session: SessionInfo | undefined` — Session details, available once `connect()` resolves
- `instances: string[]` — Current instance paths (`domainId/instanceId`) the session belongs to
- `connected: boolean` — Whether the socket is currently connected

### SessionInfo

Returned by `connect()` and available via `client.session`.

- `id` — Session ID
- `userId` — User ID established by the server's authentication hook
- `instances` — Instance paths (`domainId/instanceId`) the session is a member of

### ServerError

Passed to `onError()` handlers.

- `scope: 'connection' | 'event'` — Where the error occurred
- `event?: string` — Event name, when scope is `'event'`
- `message: string` — Error description

## Examples

### Multiplayer Chat

```ts
const client = new PlayMeshClient({ url: 'wss://chat.example.com' });
await client.connect();

client.on('chat', (data) => {
  console.log(`${data.username}: ${data.text}`);
});

client.emit('send-message', { text: 'Hello everyone!' });
```

### Game World

```ts
const client = new PlayMeshClient({ url: 'wss://game.example.com' });
await client.connect();

client.on('player:update', (player) => {
  updatePlayerPosition(player.id, player.position);
});

client.emit('player:move', { x: mouse.x, y: mouse.y });
```

## Building

```bash
npm run build      # Build with tsup
npm run typecheck  # Type check with TypeScript
```

## Browser Compatibility

The client works in modern browsers (ES2020+) and Node.js 18+. It requires WebSocket support for real-time communication.

## Philosophy

PlayMesh clients are simple and focused:

- Connect to the server
- Send events to the server
- Receive events from the server

Complex logic (authentication, persistence, game mechanics) lives on your server or in your application.

## License

MIT
