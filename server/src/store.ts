import { randomBytes, randomUUID } from "node:crypto";
import {
  normalizeRoomCode,
  roomCodeFromBytes,
  type RoomSummary,
  type RoomVisibility,
} from "@crafttogether/shared";

/**
 * In-memory room registry. Rooms are ephemeral (they live only while friends
 * are connected), so an in-memory store keeps the MVP simple and dependency
 * free. The public surface is small enough to swap for a database later
 * (implement the same methods against Prisma/SQLite).
 */

export interface GuestSession {
  guestToken: string;
  guestRelayToken: string;
  /** The host-side relay token paired with this guest. */
  hostSideRelayToken: string;
  name: string;
  joinedAt: number;
  lastSeen: number;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  hostName: string;
  visibility: RoomVisibility;
  maxGuests: number;
  createdAt: number;
  lastActivity: number;
  hostToken: string;
  guests: Map<string, GuestSession>;
}

export interface Pairing {
  tokenA: string;
  tokenB: string;
}

function newToken(): string {
  return randomBytes(16).toString("hex");
}

export class RoomStore {
  private roomsById = new Map<string, Room>();
  private roomsByCode = new Map<string, string>();
  private tokenIndex = new Map<string, { roomId: string; role: "host" | "guest" }>();

  constructor(private readonly ttlSeconds: number) {}

  createRoom(input: {
    name: string;
    hostName: string;
    visibility: RoomVisibility;
    maxGuests: number;
  }): Room {
    const id = randomUUID();
    const code = this.generateUniqueCode();
    const now = Date.now();
    const room: Room = {
      id,
      code,
      name: input.name,
      hostName: input.hostName,
      visibility: input.visibility,
      maxGuests: input.maxGuests,
      createdAt: now,
      lastActivity: now,
      hostToken: newToken(),
      guests: new Map(),
    };
    this.roomsById.set(id, room);
    this.roomsByCode.set(code, id);
    this.tokenIndex.set(room.hostToken, { roomId: id, role: "host" });
    return room;
  }

  private generateUniqueCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      const code = roomCodeFromBytes(randomBytes(8));
      if (!this.roomsByCode.has(code)) return code;
    }
    // Extremely unlikely; fall back to a longer code.
    return roomCodeFromBytes(randomBytes(12), 8);
  }

  getRoomById(id: string): Room | undefined {
    return this.roomsById.get(id);
  }

  getRoomByCode(code: string): Room | undefined {
    const id = this.roomsByCode.get(normalizeRoomCode(code));
    return id ? this.roomsById.get(id) : undefined;
  }

  resolveToken(token: string): { room: Room; role: "host" | "guest" } | undefined {
    const entry = this.tokenIndex.get(token);
    if (!entry) return undefined;
    const room = this.roomsById.get(entry.roomId);
    if (!room) return undefined;
    return { room, role: entry.role };
  }

  /** Register a guest and create the relay pairing tokens. */
  addGuest(room: Room, name: string): { session: GuestSession; pairing: Pairing } {
    const now = Date.now();
    const session: GuestSession = {
      guestToken: newToken(),
      guestRelayToken: newToken(),
      hostSideRelayToken: newToken(),
      name,
      joinedAt: now,
      lastSeen: now,
    };
    room.guests.set(session.guestToken, session);
    room.lastActivity = now;
    this.tokenIndex.set(session.guestToken, { roomId: room.id, role: "guest" });
    return {
      session,
      pairing: { tokenA: session.guestRelayToken, tokenB: session.hostSideRelayToken },
    };
  }

  removeGuest(room: Room, guestToken: string): GuestSession | undefined {
    const session = room.guests.get(guestToken);
    if (!session) return undefined;
    room.guests.delete(guestToken);
    this.tokenIndex.delete(guestToken);
    room.lastActivity = Date.now();
    return session;
  }

  closeRoom(room: Room): void {
    this.roomsById.delete(room.id);
    this.roomsByCode.delete(room.code);
    this.tokenIndex.delete(room.hostToken);
    for (const guestToken of room.guests.keys()) {
      this.tokenIndex.delete(guestToken);
    }
  }

  touch(room: Room): void {
    room.lastActivity = Date.now();
  }

  listPublicRooms(): Room[] {
    return [...this.roomsById.values()]
      .filter((r) => r.visibility === "public")
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Remove rooms with no activity for longer than the TTL. Returns closed rooms. */
  sweepExpired(now = Date.now()): Room[] {
    const closed: Room[] = [];
    for (const room of this.roomsById.values()) {
      if (now - room.lastActivity > this.ttlSeconds * 1000) {
        this.closeRoom(room);
        closed.push(room);
      }
    }
    return closed;
  }

  toSummary(room: Room): RoomSummary {
    return {
      id: room.id,
      code: room.code,
      name: room.name,
      hostName: room.hostName,
      visibility: room.visibility,
      guestCount: room.guests.size,
      maxGuests: room.maxGuests,
      createdAt: room.createdAt,
    };
  }
}
