import type { PeerRole, RelayEndpoint, RoomSummary } from "@crafttogether/shared";

/**
 * Holds the single active room session in memory so screens can share rich
 * objects (relay endpoints, tokens) without serializing them through
 * navigation params.
 */
export interface ActiveSession {
  role: PeerRole;
  room: RoomSummary;
  /** API token (hostToken or guestToken) used for signaling + leave. */
  token: string;
  /** Guest-side relay endpoint (present when role === "guest"). */
  relay?: RelayEndpoint;
  /** Local port the guest points Minecraft's "Add Server" at. */
  localPort: number;
}

let current: ActiveSession | null = null;

export function setActiveSession(session: ActiveSession): void {
  current = session;
}

export function getActiveSession(): ActiveSession | null {
  return current;
}

export function clearActiveSession(): void {
  current = null;
}
