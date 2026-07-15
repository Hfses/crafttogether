import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  CHAT_MAX_LENGTH,
  type PeerRole,
  type RelayEndpoint,
  type SignalClientMessage,
  type SignalServerMessage,
} from "@crafttogether/shared";
import type { RoomStore, Room } from "./store.js";

interface Conn {
  socket: WebSocket;
  roomId: string;
  role: PeerRole;
  token: string;
  name: string;
}

/**
 * WebSocket signaling hub. Clients connect, send `hello` with their API token,
 * and then receive room updates and relay-ready notifications. The hub never
 * carries game traffic — that goes over the UDP relay.
 */
export class SignalingHub {
  private wss: WebSocketServer;
  private byToken = new Map<string, Conn>();
  private byRoom = new Map<string, Set<Conn>>();

  constructor(private readonly store: RoomStore) {
    this.wss = new WebSocketServer({ noServer: true });
  }

  attach(server: HttpServer): void {
    server.on("upgrade", (request, socket, head) => {
      if (!request.url || !request.url.startsWith("/ws")) {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.handleConnection(ws);
      });
    });
  }

  private send(socket: WebSocket, msg: SignalServerMessage): void {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
  }

  private handleConnection(socket: WebSocket): void {
    socket.on("message", (raw) => {
      let msg: SignalClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        this.send(socket, { type: "error", message: "invalid_json" });
        return;
      }
      this.onClientMessage(socket, msg);
    });
    socket.on("close", () => this.onClose(socket));
  }

  private onClientMessage(socket: WebSocket, msg: SignalClientMessage): void {
    switch (msg.type) {
      case "hello": {
        const resolved = this.store.resolveToken(msg.token);
        if (!resolved || resolved.room.id !== msg.roomId || resolved.role !== msg.role) {
          this.send(socket, { type: "error", message: "auth_failed" });
          socket.close();
          return;
        }
        const conn: Conn = {
          socket,
          roomId: resolved.room.id,
          role: resolved.role,
          token: msg.token,
          name: resolved.role === "host" ? resolved.room.hostName : this.guestName(resolved.room, msg.token),
        };
        this.register(conn);
        this.store.touch(resolved.room);
        this.send(socket, {
          type: "welcome",
          room: this.store.toSummary(resolved.room),
          role: resolved.role,
        });
        this.broadcast(resolved.room, { type: "peer-joined", name: conn.name, role: conn.role }, conn.token);
        break;
      }
      case "chat": {
        const conn = this.connBySocket(socket);
        if (!conn) {
          this.send(socket, { type: "error", message: "not_authenticated" });
          return;
        }
        const text = typeof msg.text === "string" ? msg.text.trim().slice(0, CHAT_MAX_LENGTH) : "";
        if (!text) return;
        const room = this.store.getRoomById(conn.roomId);
        if (!room) return;
        // Broadcast to everyone in the room, including the sender (single source of truth).
        this.broadcast(room, {
          type: "chat",
          name: conn.name,
          role: conn.role,
          text,
          at: Date.now(),
        });
        break;
      }
      case "ping": {
        this.send(socket, { type: "pong" });
        break;
      }
      case "leave": {
        this.onClose(socket);
        break;
      }
      default:
        this.send(socket, { type: "error", message: "unknown_message" });
    }
  }

  private guestName(room: Room, token: string): string {
    return room.guests.get(token)?.name ?? "Amigo";
  }

  private connBySocket(socket: WebSocket): Conn | null {
    for (const conn of this.byToken.values()) {
      if (conn.socket === socket) return conn;
    }
    return null;
  }

  private register(conn: Conn): void {
    this.byToken.set(conn.token, conn);
    let set = this.byRoom.get(conn.roomId);
    if (!set) {
      set = new Set();
      this.byRoom.set(conn.roomId, set);
    }
    set.add(conn);
  }

  private onClose(socket: WebSocket): void {
    for (const [token, conn] of this.byToken) {
      if (conn.socket === socket) {
        this.byToken.delete(token);
        this.byRoom.get(conn.roomId)?.delete(conn);
        const room = this.store.getRoomById(conn.roomId);
        if (room) {
          this.broadcast(room, { type: "peer-left", name: conn.name, role: conn.role }, token);
        }
        break;
      }
    }
  }

  private broadcast(room: Room, msg: SignalServerMessage, exceptToken?: string): void {
    const set = this.byRoom.get(room.id);
    if (!set) return;
    for (const conn of set) {
      if (exceptToken && conn.token === exceptToken) continue;
      this.send(conn.socket, msg);
    }
  }

  // ---- Called by the HTTP layer ----

  broadcastRoomUpdate(room: Room): void {
    this.broadcast(room, { type: "room-update", room: this.store.toSummary(room) });
  }

  notifyHostRelayReady(room: Room, relay: RelayEndpoint): void {
    const set = this.byRoom.get(room.id);
    if (!set) return;
    for (const conn of set) {
      if (conn.role === "host") this.send(conn.socket, { type: "relay-ready", relay });
    }
  }

  notifyHostLeft(room: Room): void {
    this.broadcast(room, { type: "host-left" });
  }

  close(): void {
    for (const conn of this.byToken.values()) conn.socket.close();
    this.wss.close();
  }
}
