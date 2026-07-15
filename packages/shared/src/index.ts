/**
 * Shared protocol between the CraftTogether app and server.
 *
 * Nothing here touches Minecraft content. The relay only forwards opaque UDP
 * datagrams (RakNet packets produced by each player's own game) between two
 * peers that agreed to connect via a room code.
 */

/** Default UDP port a Minecraft Bedrock world broadcasts / listens on for LAN. */
export const BEDROCK_DEFAULT_PORT = 19132;

/** Length of a human-shareable room code (base32, no ambiguous chars). */
export const ROOM_CODE_LENGTH = 6;

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

/**
 * Generate a room code from a source of random bytes. The caller provides the
 * randomness so this stays a pure function (easy to test, no platform deps).
 */
export function roomCodeFromBytes(bytes: Uint8Array, length = ROOM_CODE_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ROOM_CODE_ALPHABET[bytes[i % bytes.length] % ROOM_CODE_ALPHABET.length];
  }
  return out;
}

export function isValidRoomCode(code: string): boolean {
  if (typeof code !== "string" || code.length !== ROOM_CODE_LENGTH) return false;
  const upper = code.toUpperCase();
  for (const ch of upper) {
    if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}

export type RoomVisibility = "public" | "private";
export type PeerRole = "host" | "guest";

export interface RoomSummary {
  id: string;
  code: string;
  name: string;
  hostName: string;
  visibility: RoomVisibility;
  guestCount: number;
  maxGuests: number;
  createdAt: number;
}

export interface RelayEndpoint {
  /** Public host/IP the on-device UDP proxy should send packets to. */
  host: string;
  /** UDP port of the relay. */
  port: number;
  /** Opaque per-peer session token; the relay routes datagrams by this token. */
  token: string;
}

// ---- REST payloads ----

export interface CreateRoomRequest {
  name: string;
  hostName: string;
  visibility: RoomVisibility;
  maxGuests?: number;
}

export interface CreateRoomResponse {
  room: RoomSummary;
  /** Relay endpoint the host's proxy uses. */
  relay: RelayEndpoint;
  /** Token the host keeps to manage/refresh the room. */
  hostToken: string;
}

export interface JoinRoomRequest {
  code: string;
  guestName: string;
}

export interface JoinRoomResponse {
  room: RoomSummary;
  /** Relay endpoint the guest's proxy uses. */
  relay: RelayEndpoint;
  /** Token the guest keeps for presence/leave. */
  guestToken: string;
}

export interface ListRoomsResponse {
  rooms: RoomSummary[];
}

// ---- WebSocket signaling ----

/** Maximum length of a single chat message (characters). */
export const CHAT_MAX_LENGTH = 300;

export type SignalClientMessage =
  | { type: "hello"; token: string; role: PeerRole; roomId: string }
  | { type: "chat"; text: string }
  | { type: "ping" }
  | { type: "leave" };

export type SignalServerMessage =
  | { type: "welcome"; room: RoomSummary; role: PeerRole }
  | { type: "room-update"; room: RoomSummary }
  | { type: "peer-joined"; name: string; role: PeerRole }
  | { type: "peer-left"; name: string; role: PeerRole }
  | { type: "chat"; name: string; role: PeerRole; text: string; at: number }
  | { type: "relay-ready"; relay: RelayEndpoint }
  | { type: "host-left" }
  | { type: "pong" }
  | { type: "error"; message: string };

/** First bytes of every relay control frame (registration handshake). */
export const RELAY_MAGIC = Uint8Array.from([0x43, 0x54, 0x30, 0x31]); // "CT01"

/**
 * When a proxy first contacts the relay it sends a registration frame:
 *   RELAY_MAGIC (4 bytes) + tokenLength (1 byte) + tokenBytes (utf8).
 * After registration, all further datagrams from that source address are
 * forwarded verbatim to the paired peer. Build/parse with the helpers below.
 */
export function encodeRelayRegister(token: string): Uint8Array {
  const tokenBytes = new TextEncoder().encode(token);
  const buf = new Uint8Array(RELAY_MAGIC.length + 1 + tokenBytes.length);
  buf.set(RELAY_MAGIC, 0);
  buf[RELAY_MAGIC.length] = tokenBytes.length;
  buf.set(tokenBytes, RELAY_MAGIC.length + 1);
  return buf;
}

export function tryParseRelayRegister(data: Uint8Array): string | null {
  if (data.length < RELAY_MAGIC.length + 1) return null;
  for (let i = 0; i < RELAY_MAGIC.length; i++) {
    if (data[i] !== RELAY_MAGIC[i]) return null;
  }
  const tokenLen = data[RELAY_MAGIC.length];
  const start = RELAY_MAGIC.length + 1;
  if (data.length < start + tokenLen) return null;
  return new TextDecoder().decode(data.subarray(start, start + tokenLen));
}
