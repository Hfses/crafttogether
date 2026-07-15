import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import {
  isValidRoomCode,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type JoinRoomRequest,
  type JoinRoomResponse,
  type ListRoomsResponse,
  type RelayEndpoint,
} from "@crafttogether/shared";
import type { AppConfig } from "./config.js";
import type { RoomStore } from "./store.js";
import type { RelayServer } from "./relay.js";
import type { SignalingHub } from "./signaling.js";

const MAX_NAME = 32;
const DEFAULT_MAX_GUESTS = 4;

function clampName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().slice(0, MAX_NAME);
  return trimmed.length > 0 ? trimmed : fallback;
}

export function buildHttpServer(deps: {
  config: AppConfig;
  store: RoomStore;
  relay: RelayServer;
  hub: SignalingHub;
}): FastifyInstance {
  const { config, store, relay, hub } = deps;
  const app = Fastify({ logger: false });

  app.register(cors, { origin: true });

  const relayEndpoint = (token: string): RelayEndpoint => ({
    host: config.publicHost,
    port: config.relayPort,
    token,
  });

  app.get("/health", async () => ({ ok: true, rooms: store.listPublicRooms().length }));

  app.post<{ Body: CreateRoomRequest }>("/rooms", async (req, reply) => {
    const body = req.body ?? ({} as CreateRoomRequest);
    const name = clampName(body.name, "Sala do Minecraft");
    const hostName = clampName(body.hostName, "Host");
    const visibility = body.visibility === "public" ? "public" : "private";
    const maxGuests = Math.max(1, Math.min(Number(body.maxGuests) || DEFAULT_MAX_GUESTS, 16));

    const room = store.createRoom({ name, hostName, visibility, maxGuests });
    const response: CreateRoomResponse = {
      room: store.toSummary(room),
      relay: relayEndpoint(room.hostToken), // placeholder; per-guest tokens are issued on join
      hostToken: room.hostToken,
    };
    return reply.code(201).send(response);
  });

  app.get("/rooms", async (): Promise<ListRoomsResponse> => {
    return { rooms: store.listPublicRooms().map((r) => store.toSummary(r)) };
  });

  app.post<{ Body: JoinRoomRequest }>("/rooms/join", async (req, reply) => {
    const body = req.body ?? ({} as JoinRoomRequest);
    if (!body.code || !isValidRoomCode(body.code)) {
      return reply.code(400).send({ error: "invalid_code" });
    }
    const room = store.getRoomByCode(body.code);
    if (!room) return reply.code(404).send({ error: "room_not_found" });
    if (room.guests.size >= room.maxGuests) {
      return reply.code(409).send({ error: "room_full" });
    }

    const guestName = clampName(body.guestName, "Amigo");
    const { session, pairing } = store.addGuest(room, guestName);

    // Wire the relay pairing and tell the host to open a socket for this guest.
    relay.registerPair(pairing.tokenA, pairing.tokenB);
    hub.notifyHostRelayReady(room, relayEndpoint(session.hostSideRelayToken));
    hub.broadcastRoomUpdate(room);

    const response: JoinRoomResponse = {
      room: store.toSummary(room),
      relay: relayEndpoint(session.guestRelayToken),
      guestToken: session.guestToken,
    };
    return reply.code(200).send(response);
  });

  app.get<{ Params: { id: string } }>("/rooms/:id", async (req, reply) => {
    const room = store.getRoomById(req.params.id);
    if (!room) return reply.code(404).send({ error: "room_not_found" });
    return reply.send({ room: store.toSummary(room) });
  });

  app.post<{ Body: { token: string } }>("/rooms/leave", async (req, reply) => {
    const token = req.body?.token;
    if (!token) return reply.code(400).send({ error: "missing_token" });
    const resolved = store.resolveToken(token);
    if (!resolved) return reply.code(404).send({ error: "not_found" });

    if (resolved.role === "host") {
      hub.notifyHostLeft(resolved.room);
      store.closeRoom(resolved.room);
    } else {
      const removed = store.removeGuest(resolved.room, token);
      if (removed) {
        relay.unregisterToken(removed.guestRelayToken);
        relay.unregisterToken(removed.hostSideRelayToken);
        hub.broadcastRoomUpdate(resolved.room);
      }
    }
    return reply.send({ ok: true });
  });

  return app;
}
