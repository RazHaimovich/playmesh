import { afterEach, describe, expect, it } from 'vitest';
import { PlayMesh } from '../src/index.js';
import { PlayMeshClient } from '@playmesh/client';

const meshes: PlayMesh[] = [];
const clients: PlayMeshClient[] = [];

function createMesh(): PlayMesh {
  const mesh = new PlayMesh({ port: 0 });
  meshes.push(mesh);
  return mesh;
}

async function createClient(port: number, auth?: Record<string, unknown>): Promise<PlayMeshClient> {
  const client = new PlayMeshClient({
    url: `http://localhost:${port}`,
    auth,
    socket: { reconnection: false, transports: ['websocket'] }
  });
  clients.push(client);
  await client.connect();
  return client;
}

function waitFor<T = unknown>(client: PlayMeshClient, event: string): Promise<T> {
  return new Promise(resolve => {
    const handler = (payload: unknown) => {
      client.off(event, handler);
      resolve(payload as T);
    };
    client.on(event, handler);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  for (const mesh of meshes.splice(0)) await mesh.shutdown();
});

describe('authentication', () => {
  it('authenticates sessions through the auth hook', async () => {
    const mesh = createMesh();
    mesh.onAuthenticate(async request => {
      if (request.token !== 'valid-token') throw new Error('Invalid token');
      return { userId: 'user-42', data: { name: 'Raz' } };
    });
    const { port } = await mesh.start();

    const client = await createClient(port, { token: 'valid-token' });
    expect(client.session?.userId).toBe('user-42');
    expect(mesh.sessions[0].data.name).toBe('Raz');
  });

  it('rejects connections when the auth hook throws', async () => {
    const mesh = createMesh();
    mesh.onAuthenticate(() => {
      throw new Error('Invalid token');
    });
    const { port } = await mesh.start();

    await expect(createClient(port, { token: 'bad' })).rejects.toThrow(/Invalid token/);
  });

  it('allows anonymous sessions when no auth hook is registered', async () => {
    const mesh = createMesh();
    const { port } = await mesh.start();

    const client = await createClient(port);
    expect(client.session?.userId).toBe(client.session?.id);
  });
});

describe('bootstrap and admission', () => {
  it('creates topology in bootstrap and auto-joins via admission', async () => {
    const mesh = createMesh();
    mesh.bootstrap(async ({ mesh }) => {
      const world = mesh.createDomain('world');
      world.createInstance('city');
      const social = mesh.createDomain('social');
      social.createInstance('global-chat');
    });
    mesh.onAdmission(async () => ({ instances: ['world/city', 'global-chat'] }));
    const { port } = await mesh.start();

    const client = await createClient(port);
    expect(client.instances.sort()).toEqual(['social/global-chat', 'world/city']);

    const session = mesh.sessions[0];
    expect(session.isIn(mesh.domain('world').instance('city'))).toBe(true);
    expect(session.isIn('social/global-chat')).toBe(true);
    expect(session.instances).toHaveLength(2);
  });

  it('rejects ambiguous bare instance ids', async () => {
    const mesh = createMesh();
    mesh.createDomain('a').createInstance('lobby');
    mesh.createDomain('b').createInstance('lobby');
    expect(() => mesh.resolveInstance('lobby')).toThrow(/ambiguous/);
    expect(() => mesh.resolveInstance('a/lobby')).not.toThrow();
  });
});

describe('events and broadcasts', () => {
  it('routes client events to instance handlers and broadcasts back', async () => {
    const mesh = createMesh();
    const world = mesh.createDomain('world');
    const city = world.createInstance('city');
    mesh.onAdmission(async () => ({ instances: ['world/city'] }));

    city.on('chat', (session, payload) => {
      city.broadcast('chat', {
        sender: session.userId,
        message: (payload as { message: string }).message
      });
    });

    const { port } = await mesh.start();
    const alice = await createClient(port);
    const bob = await createClient(port);

    const received = waitFor<{ sender: string; message: string }>(bob, 'chat');
    alice.emit('chat', { message: 'Hello' });

    const message = await received;
    expect(message.message).toBe('Hello');
    expect(message.sender).toBe(alice.session?.userId);
  });

  it('only routes events to instances the session is in', async () => {
    const mesh = createMesh();
    const world = mesh.createDomain('world');
    const city = world.createInstance('city');
    const dungeon = world.createInstance('dungeon');
    mesh.onAdmission(async () => ({ instances: ['world/city'] }));

    const cityEvents: unknown[] = [];
    const dungeonEvents: unknown[] = [];
    city.on('move', (_session, payload) => void cityEvents.push(payload));
    dungeon.on('move', (_session, payload) => void dungeonEvents.push(payload));

    const { port } = await mesh.start();
    const client = await createClient(port);
    client.emit('move', { x: 1 });
    await delay(150);

    expect(cityEvents).toHaveLength(1);
    expect(dungeonEvents).toHaveLength(0);
  });

  it('supports session.send, domain and global broadcasts', async () => {
    const mesh = createMesh();
    const world = mesh.createDomain('world');
    world.createInstance('city');
    const social = mesh.createDomain('social');
    social.createInstance('chat');
    mesh.onAdmission(async () => ({ instances: ['world/city'] }));

    const { port } = await mesh.start();
    const client = await createClient(port);

    const direct = waitFor(client, 'inventory-update');
    mesh.sessions[0].send('inventory-update', { items: ['sword'] });
    expect(await direct).toEqual({ items: ['sword'] });

    const announcement = waitFor(client, 'announcement');
    world.broadcast('announcement', { text: 'Maintenance' });
    expect(await announcement).toEqual({ text: 'Maintenance' });

    const global = waitFor(client, 'maintenance');
    mesh.broadcast('maintenance');
    await global;

    // Domain broadcasts only reach members of that domain's instances.
    const socialEvents: unknown[] = [];
    client.on('social-only', payload => void socialEvents.push(payload));
    social.broadcast('social-only', {});
    await delay(150);
    expect(socialEvents).toHaveLength(0);
  });
});

describe('multi-instance membership', () => {
  it('lets a session join and leave multiple instances', async () => {
    const mesh = createMesh();
    const world = mesh.createDomain('world');
    const city = world.createInstance('city');
    const social = mesh.createDomain('social');
    const guild = social.createInstance('guild');
    mesh.onAdmission(async () => ({ instances: ['world/city'] }));

    const joins: string[] = [];
    const leaves: string[] = [];
    guild.onJoin(session => void joins.push(session.userId));
    guild.onLeave(session => void leaves.push(session.userId));

    const { port } = await mesh.start();
    const client = await createClient(port);
    const session = mesh.sessions[0];

    await session.join(guild);
    expect(session.isIn(guild)).toBe(true);
    expect(joins).toHaveLength(1);
    await delay(100);
    expect(client.instances.sort()).toEqual(['social/guild', 'world/city']);

    const guildMessage = waitFor(client, 'guild-news');
    guild.broadcast('guild-news', { text: 'raid tonight' });
    await guildMessage;

    await session.leave(guild);
    expect(session.isIn(guild)).toBe(false);
    expect(session.isIn(city)).toBe(true);
    expect(leaves).toHaveLength(1);
    await delay(100);
    expect(client.instances).toEqual(['world/city']);
  });

  it('cleans up memberships and presence on disconnect', async () => {
    const mesh = createMesh();
    const world = mesh.createDomain('world');
    const city = world.createInstance('city');
    mesh.onAdmission(async () => ({ instances: ['world/city'] }));

    const disconnected: string[] = [];
    mesh.onDisconnect(session => void disconnected.push(session.userId));

    const { port } = await mesh.start();
    const client = await createClient(port);
    expect(await city.memberCount()).toBe(1);
    expect(await mesh.presence.onlineCount()).toBe(1);

    client.disconnect();
    await delay(200);

    expect(disconnected).toHaveLength(1);
    expect(city.sessions).toHaveLength(0);
    expect(await city.memberCount()).toBe(0);
    expect(await mesh.presence.onlineCount()).toBe(0);
    expect(mesh.sessions).toHaveLength(0);
  });
});

describe('middleware', () => {
  it('runs middleware before handlers and can block events', async () => {
    const mesh = createMesh();
    const world = mesh.createDomain('world');
    const city = world.createInstance('city');
    mesh.onAdmission(async () => ({ instances: ['world/city'] }));

    const seen: string[] = [];
    mesh.use(async (context, next) => {
      seen.push(context.event);
      if (context.event === 'forbidden') {
        throw new Error('Not allowed');
      }
      await next();
    });

    const handled: string[] = [];
    city.on('allowed', () => void handled.push('allowed'));
    city.on('forbidden', () => void handled.push('forbidden'));

    const { port } = await mesh.start();
    const client = await createClient(port);

    const errorReceived = new Promise<string>(resolve => {
      client.onError(error => resolve(error.message));
    });

    client.emit('allowed', {});
    client.emit('forbidden', {});
    expect(await errorReceived).toBe('Not allowed');
    await delay(100);

    expect(seen).toEqual(['allowed', 'forbidden']);
    expect(handled).toEqual(['allowed']);
  });
});

describe('runtime state', () => {
  it('stores and retrieves instance-scoped runtime state', async () => {
    const mesh = createMesh();
    const world = mesh.createDomain('world');
    const dungeon = world.createInstance('dungeon');
    const city = world.createInstance('city');
    await mesh.start();

    await dungeon.state.set('boss-health', 1500);
    await city.state.set('boss-health', 100);

    expect(await dungeon.state.get('boss-health')).toBe(1500);
    expect(await city.state.get('boss-health')).toBe(100);

    await dungeon.state.delete('boss-health');
    expect(await dungeon.state.get('boss-health')).toBeUndefined();
  });
});

describe('lifecycle', () => {
  it('fires started and shutdown hooks and reports metrics', async () => {
    const mesh = createMesh();
    const order: string[] = [];
    mesh.bootstrap(async () => void order.push('bootstrap'));
    mesh.onStarted(() => void order.push('started'));
    mesh.onShutdown(() => void order.push('shutdown'));

    mesh.createDomain('world').createInstance('city');
    await mesh.start();
    expect(order).toEqual(['bootstrap', 'started']);

    const metrics = mesh.metrics();
    expect(metrics.domains).toBe(1);
    expect(metrics.instances).toBe(1);
    expect(metrics.sessions).toBe(0);

    await mesh.shutdown();
    expect(order).toEqual(['bootstrap', 'started', 'shutdown']);
  });

  it('supports plugins installed at start', async () => {
    const mesh = createMesh();
    const installed: string[] = [];
    mesh.use({
      name: 'matchmaking',
      install(target) {
        installed.push('matchmaking');
        target.createDomain('matches');
      }
    });
    await mesh.start();

    expect(installed).toEqual(['matchmaking']);
    expect(mesh.hasDomain('matches')).toBe(true);
  });
});
