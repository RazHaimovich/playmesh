/**
 * Reserved wire-protocol event names exchanged between the PlayMesh
 * server and client SDKs. Application events must not use the
 * `playmesh:` prefix.
 */
export const PROTOCOL = {
  /** Sent to the client once its session is established. */
  SESSION: 'playmesh:session',
  /** Sent to the client when its session joins an instance. */
  JOINED: 'playmesh:joined',
  /** Sent to the client when its session leaves an instance. */
  LEFT: 'playmesh:left',
  /** Sent to the client when an inbound event fails server-side. */
  ERROR: 'playmesh:error'
} as const;

export const RESERVED_PREFIX = 'playmesh:';

export function instanceRoom(path: string): string {
  return `playmesh:instance:${path}`;
}

export function domainRoom(domainId: string): string {
  return `playmesh:domain:${domainId}`;
}
